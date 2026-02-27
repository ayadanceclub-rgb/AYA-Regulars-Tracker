from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, io, csv
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
JWT_SECRET = os.environ.get('JWT_SECRET', 'aya-regulars-secret-2024')
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI()
api_router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

# ==================== AUTH HELPERS ====================
def create_token(user_id: str, role: str) -> str:
    return jwt.encode(
        {"user_id": user_id, "role": role, "exp": datetime.now(timezone.utc) + timedelta(hours=24)},
        JWT_SECRET, algorithm="HS256"
    )

async def get_current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(auth.split(" ")[1], JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user or not user.get("active", True):
        raise HTTPException(401, "User not found or inactive")
    return user

def require_admin(user):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")

# ==================== AUDIT LOG HELPER ====================
async def audit_log(actor_id, action_type, entity_type, entity_id, metadata=None):
    doc = {
        "id": str(uuid.uuid4()),
        "actor_user_id": actor_id,
        "action_type": action_type,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "metadata": metadata or {},
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_log.insert_one({**doc})

# ==================== SETTINGS & PASS STATUS HELPERS ====================
async def get_settings():
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    return s or {"id": "global", "monthly_expiry_warning_days": 5, "class_pack_expiry_warning_remaining": 2}

def compute_pass_status(p, settings):
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    if p["type"] == "monthly":
        if now_iso > p.get("end_date", ""):
            return "expired"
        try:
            end = datetime.fromisoformat(p["end_date"])
            if (end - now).days <= settings.get("monthly_expiry_warning_days", 5):
                return "expiring_soon"
        except Exception:
            pass
        return "active"
    elif p["type"] == "class_pack":
        if p.get("remaining_classes", 0) <= 0:
            return "expired"
        if p.get("remaining_classes", 0) <= settings.get("class_pack_expiry_warning_remaining", 2):
            return "expiring_soon"
        return "active"
    elif p["type"] == "drop_in":
        return p.get("status", "unused")
    return "unknown"

# ==================== PYDANTIC MODELS ====================
class LoginReq(BaseModel):
    email: str
    password: str

class UserCreateReq(BaseModel):
    email: str
    password: str
    name: str

class BatchCreateReq(BaseModel):
    batch_name: str
    studio_name: str
    schedule_days: str
    time_slot: str
    assigned_instructor_ids: List[str] = []

class DancerCreateReq(BaseModel):
    full_name: str
    phone_number: str = ""
    notes: str = ""
    batch_id: str = ""

class PassCreateReq(BaseModel):
    dancer_id: str
    batch_id: str
    type: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    total_classes: Optional[int] = None
    session_id: Optional[str] = None

class AttendanceRecord(BaseModel):
    dancer_id: str
    status: str

class AttendanceBulkReq(BaseModel):
    session_id: str
    batch_id: str
    records: List[AttendanceRecord]

# ==================== AUTH ROUTES ====================
@api_router.post("/auth/login")
async def login(req: LoginReq):
    user = await db.users.find_one({"email": req.email}, {"_id": 0})
    if not user or not pwd_context.verify(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if not user.get("active", True):
        raise HTTPException(401, "Account disabled")
    token = create_token(user["id"], user["role"])
    return {"token": token, "user": {k: v for k, v in user.items() if k != "password_hash"}}

@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {k: v for k, v in user.items() if k != "password_hash"}

# ==================== USER ROUTES (Admin manages instructors) ====================
@api_router.get("/users")
async def list_users(user=Depends(get_current_user)):
    require_admin(user)
    return await db.users.find({"role": "instructor"}, {"_id": 0, "password_hash": 0}).to_list(1000)

@api_router.post("/users")
async def create_user(data: UserCreateReq, user=Depends(get_current_user)):
    require_admin(user)
    if await db.users.find_one({"email": data.email}):
        raise HTTPException(400, "Email already exists")
    doc = {
        "id": str(uuid.uuid4()), "email": data.email,
        "password_hash": pwd_context.hash(data.password),
        "name": data.name, "role": "instructor", "active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one({**doc})
    await audit_log(user["id"], "create_instructor", "user", doc["id"], {"name": data.name, "email": data.email})
    return {k: v for k, v in doc.items() if k != "password_hash"}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: dict, user=Depends(get_current_user)):
    require_admin(user)
    updates = {}
    for k in ["name", "email", "active"]:
        if k in data:
            updates[k] = data[k]
    if data.get("password"):
        updates["password_hash"] = pwd_context.hash(data["password"])
    if not updates:
        raise HTTPException(400, "Nothing to update")
    await db.users.update_one({"id": user_id}, {"$set": updates})
    await audit_log(user["id"], "update_instructor", "user", user_id,
                    {"updates": {k: v for k, v in updates.items() if k != "password_hash"}})
    return await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})

@api_router.delete("/users/{user_id}")
async def deactivate_user(user_id: str, user=Depends(get_current_user)):
    require_admin(user)
    await db.users.update_one({"id": user_id}, {"$set": {"active": False}})
    await audit_log(user["id"], "deactivate_instructor", "user", user_id)
    return {"status": "deactivated"}

# ==================== BATCH ROUTES ====================
@api_router.get("/batches")
async def list_batches(user=Depends(get_current_user)):
    query = {} if user["role"] == "admin" else {"assigned_instructor_ids": user["id"]}
    batches = await db.batches.find(query, {"_id": 0}).to_list(1000)
    settings = await get_settings()
    for b in batches:
        enrollments = await db.enrollments.find({"batch_id": b["id"], "active": True}, {"_id": 0}).to_list(5000)
        b["dancer_count"] = len(enrollments)
        dancer_ids = [e["dancer_id"] for e in enrollments]
        passes = await db.passes.find({"batch_id": b["id"], "dancer_id": {"$in": dancer_ids}}, {"_id": 0}).to_list(5000)
        # Deduplicate: only latest pass per dancer
        latest_passes = {}
        for p in sorted(passes, key=lambda x: x.get("created_at", ""), reverse=True):
            if p["dancer_id"] not in latest_passes:
                latest_passes[p["dancer_id"]] = p
        unique_passes = list(latest_passes.values())
        b["expiring_soon_count"] = sum(1 for p in unique_passes if compute_pass_status(p, settings) == "expiring_soon")
        b["expired_count"] = sum(1 for p in unique_passes if compute_pass_status(p, settings) == "expired")
        if b.get("assigned_instructor_ids"):
            b["instructors"] = await db.users.find(
                {"id": {"$in": b["assigned_instructor_ids"]}}, {"_id": 0, "password_hash": 0}
            ).to_list(100)
        else:
            b["instructors"] = []
    return batches

@api_router.get("/batches/{batch_id}")
async def get_batch(batch_id: str, user=Depends(get_current_user)):
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(404, "Batch not found")
    return batch

@api_router.post("/batches")
async def create_batch(data: BatchCreateReq, user=Depends(get_current_user)):
    require_admin(user)
    doc = {"id": str(uuid.uuid4()), **data.model_dump(), "active": True, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.batches.insert_one({**doc})
    await audit_log(user["id"], "create_batch", "batch", doc["id"], {"batch_name": data.batch_name})
    return doc

@api_router.put("/batches/{batch_id}")
async def update_batch(batch_id: str, data: dict, user=Depends(get_current_user)):
    require_admin(user)
    allowed = {"batch_name", "studio_name", "schedule_days", "time_slot", "assigned_instructor_ids", "active"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    old = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    await db.batches.update_one({"id": batch_id}, {"$set": updates})
    await audit_log(user["id"], "update_batch", "batch", batch_id, {"before": old, "after": updates})
    return await db.batches.find_one({"id": batch_id}, {"_id": 0})

@api_router.delete("/batches/{batch_id}")
async def deactivate_batch(batch_id: str, user=Depends(get_current_user)):
    require_admin(user)
    await db.batches.update_one({"id": batch_id}, {"$set": {"active": False}})
    await audit_log(user["id"], "deactivate_batch", "batch", batch_id)
    return {"status": "deactivated"}

# ==================== DANCER ROUTES ====================
@api_router.get("/dancers")
async def list_dancers(batch_id: str = Query(None), search: str = Query(None), user=Depends(get_current_user)):
    settings = await get_settings()
    if batch_id:
        enrollments = await db.enrollments.find({"batch_id": batch_id, "active": True}, {"_id": 0}).to_list(5000)
        dancer_ids = [e["dancer_id"] for e in enrollments]
        dq = {"id": {"$in": dancer_ids}, "active": True}
        if search:
            dq["$or"] = [
                {"full_name": {"$regex": search, "$options": "i"}},
                {"phone_number": {"$regex": search, "$options": "i"}}
            ]
        dancers = await db.dancers.find(dq, {"_id": 0}).to_list(5000)
        for d in dancers:
            d["enrollment"] = next((e for e in enrollments if e["dancer_id"] == d["id"]), None)
            passes = await db.passes.find(
                {"dancer_id": d["id"], "batch_id": batch_id}, {"_id": 0}
            ).sort("created_at", -1).to_list(100)
            active_pass = None
            for p in passes:
                p["computed_status"] = compute_pass_status(p, settings)
                if p["computed_status"] in ("active", "expiring_soon"):
                    active_pass = p
                    break
            if not active_pass and passes:
                passes[0]["computed_status"] = compute_pass_status(passes[0], settings)
                active_pass = passes[0]
            d["active_pass"] = active_pass
    else:
        if user["role"] != "admin":
            batches = await db.batches.find({"assigned_instructor_ids": user["id"]}, {"_id": 0}).to_list(100)
            batch_ids = [b["id"] for b in batches]
            enrollments = await db.enrollments.find({"batch_id": {"$in": batch_ids}, "active": True}, {"_id": 0}).to_list(5000)
            dancer_ids = list(set(e["dancer_id"] for e in enrollments))
            dq = {"id": {"$in": dancer_ids}}
        else:
            dq = {}
        if search:
            dq["$or"] = [
                {"full_name": {"$regex": search, "$options": "i"}},
                {"phone_number": {"$regex": search, "$options": "i"}}
            ]
        dancers = await db.dancers.find(dq, {"_id": 0}).to_list(5000)
        for d in dancers:
            d["enrollments"] = await db.enrollments.find({"dancer_id": d["id"], "active": True}, {"_id": 0}).to_list(100)
            all_passes = await db.passes.find({"dancer_id": d["id"]}, {"_id": 0}).to_list(100)
            for p in all_passes:
                p["computed_status"] = compute_pass_status(p, settings)
            d["passes"] = all_passes
            att = await db.attendance.find({"dancer_id": d["id"]}, {"_id": 0}).to_list(5000)
            d["total_sessions"] = len(att)
            d["present_count"] = sum(1 for a in att if a["status"] == "present")
    return dancers

@api_router.get("/dancers/{dancer_id}")
async def get_dancer(dancer_id: str, user=Depends(get_current_user)):
    dancer = await db.dancers.find_one({"id": dancer_id}, {"_id": 0})
    if not dancer:
        raise HTTPException(404, "Dancer not found")
    settings = await get_settings()
    dancer["enrollments"] = await db.enrollments.find({"dancer_id": dancer_id}, {"_id": 0}).to_list(100)
    passes = await db.passes.find({"dancer_id": dancer_id}, {"_id": 0}).to_list(100)
    for p in passes:
        p["computed_status"] = compute_pass_status(p, settings)
    dancer["passes"] = passes
    att = await db.attendance.find({"dancer_id": dancer_id}, {"_id": 0}).to_list(5000)
    dancer["total_sessions"] = len(att)
    dancer["present_count"] = sum(1 for a in att if a["status"] == "present")
    return dancer

@api_router.post("/dancers")
async def create_dancer(data: DancerCreateReq, user=Depends(get_current_user)):
    if user["role"] == "instructor" and data.batch_id:
        batch = await db.batches.find_one({"id": data.batch_id}, {"_id": 0})
        if not batch or user["id"] not in batch.get("assigned_instructor_ids", []):
            raise HTTPException(403, "Not assigned to this batch")
    dancer = {
        "id": str(uuid.uuid4()), "full_name": data.full_name,
        "phone_number": data.phone_number, "notes": data.notes,
        "active": True, "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.dancers.insert_one({**dancer})
    await audit_log(user["id"], "create_dancer", "dancer", dancer["id"], {"name": data.full_name})
    if data.batch_id:
        enrollment = {
            "id": str(uuid.uuid4()), "dancer_id": dancer["id"],
            "batch_id": data.batch_id, "active": True,
            "join_date": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.enrollments.insert_one({**enrollment})
        await audit_log(user["id"], "create_enrollment", "enrollment", enrollment["id"],
                        {"dancer_id": dancer["id"], "batch_id": data.batch_id})
    return dancer

@api_router.put("/dancers/{dancer_id}")
async def update_dancer(dancer_id: str, data: dict, user=Depends(get_current_user)):
    allowed = {"full_name", "phone_number", "notes"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    old = await db.dancers.find_one({"id": dancer_id}, {"_id": 0})
    await db.dancers.update_one({"id": dancer_id}, {"$set": updates})
    await audit_log(user["id"], "update_dancer", "dancer", dancer_id, {"before": old, "after": updates})
    return await db.dancers.find_one({"id": dancer_id}, {"_id": 0})

@api_router.delete("/dancers/{dancer_id}")
async def deactivate_dancer(dancer_id: str, user=Depends(get_current_user)):
    require_admin(user)
    await db.dancers.update_one({"id": dancer_id}, {"$set": {"active": False}})
    await audit_log(user["id"], "deactivate_dancer", "dancer", dancer_id)
    return {"status": "deactivated"}

# ==================== ENROLLMENT ROUTES ====================
@api_router.post("/enrollments")
async def create_enrollment(data: dict, user=Depends(get_current_user)):
    dancer_id, batch_id = data.get("dancer_id"), data.get("batch_id")
    if not dancer_id or not batch_id:
        raise HTTPException(400, "dancer_id and batch_id required")
    existing = await db.enrollments.find_one({"dancer_id": dancer_id, "batch_id": batch_id, "active": True})
    if existing:
        raise HTTPException(400, "Already enrolled")
    enrollment = {
        "id": str(uuid.uuid4()), "dancer_id": dancer_id, "batch_id": batch_id,
        "active": True, "join_date": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.enrollments.insert_one({**enrollment})
    await audit_log(user["id"], "create_enrollment", "enrollment", enrollment["id"],
                    {"dancer_id": dancer_id, "batch_id": batch_id})
    return enrollment

@api_router.put("/enrollments/{enrollment_id}/deactivate")
async def deactivate_enrollment(enrollment_id: str, user=Depends(get_current_user)):
    enrollment = await db.enrollments.find_one({"id": enrollment_id}, {"_id": 0})
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")
    await db.enrollments.update_one({"id": enrollment_id}, {"$set": {"active": False}})
    await audit_log(user["id"], "remove_dancer_from_batch", "enrollment", enrollment_id,
                    {"dancer_id": enrollment["dancer_id"], "batch_id": enrollment["batch_id"]})
    return {"status": "deactivated"}

# ==================== PASS ROUTES ====================
@api_router.get("/passes")
async def list_passes(dancer_id: str = None, batch_id: str = None, user=Depends(get_current_user)):
    query = {}
    if dancer_id:
        query["dancer_id"] = dancer_id
    if batch_id:
        query["batch_id"] = batch_id
    passes = await db.passes.find(query, {"_id": 0}).to_list(5000)
    settings = await get_settings()
    for p in passes:
        p["computed_status"] = compute_pass_status(p, settings)
    return passes

@api_router.post("/passes")
async def create_pass(data: PassCreateReq, user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()), "dancer_id": data.dancer_id, "batch_id": data.batch_id,
        "type": data.type, "created_at": now.isoformat(), "created_by": user["id"]
    }
    if data.type == "monthly":
        doc["start_date"] = data.start_date or now.isoformat()
        doc["end_date"] = data.end_date or (now + timedelta(days=30)).isoformat()
        doc["status"] = "active"
    elif data.type == "class_pack":
        doc["total_classes"] = data.total_classes or 8
        doc["remaining_classes"] = doc["total_classes"]
        doc["start_date"] = data.start_date or now.isoformat()
        doc["end_date"] = data.end_date or ""
        doc["status"] = "active"
    elif data.type == "drop_in":
        doc["total_classes"] = 1
        doc["remaining_classes"] = 1
        doc["session_id"] = data.session_id or ""
        doc["valid_date"] = now.strftime("%Y-%m-%d")
        doc["status"] = "unused"
    await db.passes.insert_one({**doc})
    await audit_log(user["id"], "create_pass", "pass", doc["id"],
                    {"dancer_id": data.dancer_id, "type": data.type})
    return doc

@api_router.put("/passes/{pass_id}/renew")
async def renew_pass(pass_id: str, data: dict, user=Depends(get_current_user)):
    old = await db.passes.find_one({"id": pass_id}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Pass not found")
    now = datetime.now(timezone.utc)
    updates = {}
    if old["type"] == "monthly":
        updates["start_date"] = data.get("start_date", now.isoformat())
        updates["end_date"] = data.get("end_date", (now + timedelta(days=30)).isoformat())
        updates["status"] = "active"
    elif old["type"] == "class_pack":
        total = data.get("total_classes", old.get("total_classes", 8))
        updates["total_classes"] = total
        updates["remaining_classes"] = total
        updates["start_date"] = data.get("start_date", now.isoformat())
        updates["status"] = "active"
    await db.passes.update_one({"id": pass_id}, {"$set": updates})
    await audit_log(user["id"], "renew_pass", "pass", pass_id, {"before": old, "after": updates})
    return await db.passes.find_one({"id": pass_id}, {"_id": 0})

# ==================== SESSION ROUTES ====================
@api_router.get("/sessions/today")
async def get_today_session(batch_id: str = Query(...), user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    session = await db.sessions.find_one({"batch_id": batch_id, "date": today}, {"_id": 0})
    if not session:
        session = {
            "id": str(uuid.uuid4()), "batch_id": batch_id, "date": today,
            "created_by": user["id"], "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.sessions.insert_one({**session})
    return session

@api_router.get("/sessions")
async def list_sessions(batch_id: str = Query(None), user=Depends(get_current_user)):
    query = {}
    if batch_id:
        query["batch_id"] = batch_id
    sessions = await db.sessions.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    for s in sessions:
        att = await db.attendance.find({"session_id": s["id"]}, {"_id": 0}).to_list(5000)
        s["total"] = len(att)
        s["present_count"] = sum(1 for a in att if a["status"] == "present")
        s["absent_count"] = sum(1 for a in att if a["status"] == "absent")
    return sessions

@api_router.post("/sessions")
async def create_session(data: dict, user=Depends(get_current_user)):
    batch_id = data.get("batch_id")
    date = data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    existing = await db.sessions.find_one({"batch_id": batch_id, "date": date})
    if existing:
        raise HTTPException(400, "Session already exists for this date")
    session = {
        "id": str(uuid.uuid4()), "batch_id": batch_id, "date": date,
        "created_by": user["id"], "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.sessions.insert_one({**session})
    return session

# ==================== ATTENDANCE ROUTES ====================
@api_router.get("/attendance")
async def get_attendance(session_id: str = Query(...), user=Depends(get_current_user)):
    return await db.attendance.find({"session_id": session_id}, {"_id": 0}).to_list(5000)

@api_router.post("/attendance/bulk")
async def mark_attendance_bulk(data: AttendanceBulkReq, user=Depends(get_current_user)):
    settings = await get_settings()
    warnings = []
    results = []

    for record in data.records:
        existing = await db.attendance.find_one(
            {"session_id": data.session_id, "dancer_id": record.dancer_id}, {"_id": 0}
        )
        old_status = existing["status"] if existing else None
        new_status = record.status
        pass_used = None

        # Consume pass when marking present
        if new_status == "present" and old_status != "present":
            active_passes = await db.passes.find(
                {"dancer_id": record.dancer_id, "batch_id": data.batch_id}, {"_id": 0}
            ).sort("created_at", -1).to_list(100)
            for p in active_passes:
                st = compute_pass_status(p, settings)
                if st in ("active", "expiring_soon"):
                    pass_used = p
                    break
                if p["type"] == "drop_in" and p.get("status") == "unused":
                    pass_used = p
                    break
            if pass_used:
                if pass_used["type"] == "class_pack":
                    nr = pass_used.get("remaining_classes", 0) - 1
                    await db.passes.update_one({"id": pass_used["id"]}, {"$set": {"remaining_classes": nr}})
                    if nr <= 0:
                        warnings.append({"dancer_id": record.dancer_id, "message": "Class pack exhausted"})
                    elif nr <= settings.get("class_pack_expiry_warning_remaining", 2):
                        warnings.append({"dancer_id": record.dancer_id, "message": f"Class pack low: {nr} remaining"})
                elif pass_used["type"] == "drop_in":
                    await db.passes.update_one({"id": pass_used["id"]}, {"$set": {"status": "used"}})
                elif pass_used["type"] == "monthly":
                    cs = compute_pass_status(pass_used, settings)
                    if cs == "expiring_soon":
                        warnings.append({"dancer_id": record.dancer_id, "message": "Monthly pass expiring soon"})
                    elif cs == "expired":
                        warnings.append({"dancer_id": record.dancer_id, "message": "Monthly pass expired"})
            else:
                warnings.append({"dancer_id": record.dancer_id, "message": "No active pass"})

        # Reverse consumption when changing from present
        elif old_status == "present" and new_status != "present":
            if existing and existing.get("pass_id"):
                old_pass = await db.passes.find_one({"id": existing["pass_id"]}, {"_id": 0})
                if old_pass:
                    if old_pass["type"] == "class_pack":
                        await db.passes.update_one({"id": old_pass["id"]}, {"$inc": {"remaining_classes": 1}})
                    elif old_pass["type"] == "drop_in":
                        await db.passes.update_one({"id": old_pass["id"]}, {"$set": {"status": "unused"}})

        att_doc = {
            "session_id": data.session_id, "dancer_id": record.dancer_id,
            "status": new_status, "marked_by": user["id"],
            "pass_id": pass_used["id"] if pass_used else (existing.get("pass_id") if existing else None),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        if existing:
            await db.attendance.update_one({"id": existing["id"]}, {"$set": att_doc})
            att_doc["id"] = existing["id"]
        else:
            att_doc["id"] = str(uuid.uuid4())
            await db.attendance.insert_one({**att_doc})
        await audit_log(user["id"], "mark_attendance", "attendance", att_doc["id"],
                        {"dancer_id": record.dancer_id, "status": new_status, "session_id": data.session_id})
        results.append(att_doc)

    return {"results": results, "warnings": warnings}

# ==================== AUDIT LOG ROUTES ====================
@api_router.get("/audit-log")
async def get_audit_log_route(
    user=Depends(get_current_user),
    actor_id: str = None, action_type: str = None,
    entity_type: str = None, start_date: str = None,
    end_date: str = None, page: int = 1, limit: int = 50
):
    require_admin(user)
    query = {}
    if actor_id:
        query["actor_user_id"] = actor_id
    if action_type:
        query["action_type"] = action_type
    if entity_type:
        query["entity_type"] = entity_type
    if start_date or end_date:
        query["timestamp"] = {}
        if start_date:
            query["timestamp"]["$gte"] = start_date
        if end_date:
            query["timestamp"]["$lte"] = end_date + "T23:59:59"
    total = await db.audit_log.count_documents(query)
    logs = await db.audit_log.find(query, {"_id": 0}).sort("timestamp", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    actor_ids = list(set(l["actor_user_id"] for l in logs))
    actors = await db.users.find({"id": {"$in": actor_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(100)
    actor_map = {a["id"]: a.get("name", a.get("email", "Unknown")) for a in actors}
    for l in logs:
        l["actor_name"] = actor_map.get(l["actor_user_id"], "Unknown")
    return {"logs": logs, "total": total, "page": page, "limit": limit}

# ==================== NOTIFICATION ROUTES ====================
@api_router.get("/notifications")
async def get_notifications(user=Depends(get_current_user)):
    settings = await get_settings()
    notifications = []
    if user["role"] == "admin":
        batches = await db.batches.find({"active": True}, {"_id": 0}).to_list(100)
    else:
        batches = await db.batches.find({"assigned_instructor_ids": user["id"], "active": True}, {"_id": 0}).to_list(100)
    for batch in batches:
        enrollments = await db.enrollments.find({"batch_id": batch["id"], "active": True}, {"_id": 0}).to_list(5000)
        dancer_ids = [e["dancer_id"] for e in enrollments]
        for did in dancer_ids:
            dancer = await db.dancers.find_one({"id": did}, {"_id": 0})
            if not dancer:
                continue
            passes = await db.passes.find({"dancer_id": did, "batch_id": batch["id"]}, {"_id": 0}).to_list(100)
            for p in passes:
                status = compute_pass_status(p, settings)
                if status in ("expiring_soon", "expired"):
                    msg = ""
                    if p["type"] == "monthly":
                        msg = f"Monthly pass {'expiring soon' if status == 'expiring_soon' else 'expired'} (ends {p.get('end_date', '')[:10]})"
                    elif p["type"] == "class_pack":
                        msg = f"Class pack: {p.get('remaining_classes', 0)} classes remaining" if status == "expiring_soon" else "Class pack expired"
                    notifications.append({
                        "id": p["id"], "type": status,
                        "dancer_name": dancer["full_name"], "dancer_id": did,
                        "batch_name": batch["batch_name"], "batch_id": batch["id"],
                        "message": msg, "pass_type": p["type"]
                    })
    return notifications

# ==================== REPORT ROUTES ====================
@api_router.get("/reports/attendance")
async def get_attendance_report(batch_id: str = None, start_date: str = None, end_date: str = None, user=Depends(get_current_user)):
    require_admin(user)
    sq = {}
    if batch_id:
        sq["batch_id"] = batch_id
    if start_date or end_date:
        sq["date"] = {}
        if start_date:
            sq["date"]["$gte"] = start_date
        if end_date:
            sq["date"]["$lte"] = end_date
    sessions = await db.sessions.find(sq, {"_id": 0}).to_list(5000)
    batches = await db.batches.find({}, {"_id": 0}).to_list(100)
    batch_map = {b["id"]: b for b in batches}
    report = {}
    for s in sessions:
        bid = s["batch_id"]
        if bid not in report:
            bi = batch_map.get(bid, {})
            report[bid] = {"batch_id": bid, "batch_name": bi.get("batch_name", "Unknown"), "total_sessions": 0, "total_present": 0, "total_absent": 0, "sessions": []}
        att = await db.attendance.find({"session_id": s["id"]}, {"_id": 0}).to_list(5000)
        present = sum(1 for a in att if a["status"] == "present")
        absent = sum(1 for a in att if a["status"] == "absent")
        report[bid]["total_sessions"] += 1
        report[bid]["total_present"] += present
        report[bid]["total_absent"] += absent
        report[bid]["sessions"].append({"date": s["date"], "present": present, "absent": absent, "total": len(att)})
    return list(report.values())

@api_router.get("/reports/expiring")
async def get_expiring_report(user=Depends(get_current_user)):
    require_admin(user)
    settings = await get_settings()
    passes = await db.passes.find({}, {"_id": 0}).to_list(10000)
    expiring, expired_list = [], []
    for p in passes:
        status = compute_pass_status(p, settings)
        if status not in ("expiring_soon", "expired"):
            continue
        dancer = await db.dancers.find_one({"id": p["dancer_id"]}, {"_id": 0})
        batch = await db.batches.find_one({"id": p["batch_id"]}, {"_id": 0})
        entry = {**p, "computed_status": status, "dancer_name": dancer["full_name"] if dancer else "Unknown", "batch_name": batch["batch_name"] if batch else "Unknown"}
        if status == "expiring_soon":
            expiring.append(entry)
        else:
            expired_list.append(entry)
    return {"expiring": expiring, "expired": expired_list}

@api_router.get("/reports/csv")
async def export_csv(batch_id: str = None, start_date: str = None, end_date: str = None, user=Depends(get_current_user)):
    require_admin(user)
    sq = {}
    if batch_id:
        sq["batch_id"] = batch_id
    if start_date or end_date:
        sq["date"] = {}
        if start_date:
            sq["date"]["$gte"] = start_date
        if end_date:
            sq["date"]["$lte"] = end_date
    sessions = await db.sessions.find(sq, {"_id": 0}).to_list(5000)
    batches = await db.batches.find({}, {"_id": 0}).to_list(100)
    batch_map = {b["id"]: b["batch_name"] for b in batches}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Batch", "Dancer", "Phone", "Status", "Pass Type"])
    for s in sessions:
        att_records = await db.attendance.find({"session_id": s["id"]}, {"_id": 0}).to_list(5000)
        for a in att_records:
            dancer = await db.dancers.find_one({"id": a["dancer_id"]}, {"_id": 0})
            pass_doc = await db.passes.find_one({"id": a.get("pass_id")}, {"_id": 0}) if a.get("pass_id") else None
            writer.writerow([
                s["date"], batch_map.get(s["batch_id"], "Unknown"),
                dancer.get("full_name", "") if dancer else "", dancer.get("phone_number", "") if dancer else "",
                a["status"], pass_doc["type"] if pass_doc else "none"
            ])
    output.seek(0)
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=attendance_report.csv"})

# ==================== SETTINGS ROUTES ====================
@api_router.get("/settings")
async def get_settings_route(user=Depends(get_current_user)):
    require_admin(user)
    return await get_settings()

@api_router.put("/settings")
async def update_settings(data: dict, user=Depends(get_current_user)):
    require_admin(user)
    allowed = {"monthly_expiry_warning_days", "class_pack_expiry_warning_remaining"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    old = await get_settings()
    await db.settings.update_one({"id": "global"}, {"$set": updates}, upsert=True)
    await audit_log(user["id"], "update_settings", "settings", "global", {"before": old, "after": updates})
    return await get_settings()

# ==================== DASHBOARD STATS ====================
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user=Depends(get_current_user)):
    settings = await get_settings()
    if user["role"] == "admin":
        active_batches = await db.batches.count_documents({"active": True})
        total_dancers = await db.dancers.count_documents({"active": True})
        passes = await db.passes.find({}, {"_id": 0}).to_list(10000)
        expiring = sum(1 for p in passes if compute_pass_status(p, settings) == "expiring_soon")
        expired = sum(1 for p in passes if compute_pass_status(p, settings) == "expired")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        today_sessions = await db.sessions.count_documents({"date": today})
        return {"active_batches": active_batches, "total_dancers": total_dancers,
                "expiring_soon": expiring, "expired": expired, "today_sessions": today_sessions}
    else:
        batches = await db.batches.find({"assigned_instructor_ids": user["id"], "active": True}, {"_id": 0}).to_list(100)
        batch_ids = [b["id"] for b in batches]
        enrollments = await db.enrollments.find({"batch_id": {"$in": batch_ids}, "active": True}).to_list(5000)
        dancer_ids = list(set(e["dancer_id"] for e in enrollments))
        passes = await db.passes.find({"batch_id": {"$in": batch_ids}}, {"_id": 0}).to_list(5000)
        expiring = sum(1 for p in passes if compute_pass_status(p, settings) == "expiring_soon")
        expired = sum(1 for p in passes if compute_pass_status(p, settings) == "expired")
        return {"active_batches": len(batches), "total_dancers": len(dancer_ids),
                "expiring_soon": expiring, "expired": expired, "today_sessions": 0}

# ==================== SEED ROUTE ====================
@api_router.post("/seed")
async def seed_data():
    admin = await db.users.find_one({"email": "admin@aya.dance"})
    if admin:
        return {"message": "Already seeded"}
    now = datetime.now(timezone.utc)

    admin_id = str(uuid.uuid4())
    await db.users.insert_one({"id": admin_id, "email": "admin@aya.dance",
        "password_hash": pwd_context.hash("admin123"), "name": "AYA Admin",
        "role": "admin", "active": True, "created_at": now.isoformat()})

    inst1_id = str(uuid.uuid4())
    await db.users.insert_one({"id": inst1_id, "email": "prerrna@aya.dance",
        "password_hash": pwd_context.hash("instructor123"), "name": "Prerrna",
        "role": "instructor", "active": True, "created_at": now.isoformat()})

    inst2_id = str(uuid.uuid4())
    await db.users.insert_one({"id": inst2_id, "email": "arjun@aya.dance",
        "password_hash": pwd_context.hash("instructor123"), "name": "Arjun",
        "role": "instructor", "active": True, "created_at": now.isoformat()})

    batch_id = str(uuid.uuid4())
    await db.batches.insert_one({"id": batch_id, "batch_name": "Open-Style Batch",
        "studio_name": "Prerrna Dance Studios", "schedule_days": "Tue/Thu",
        "time_slot": "7:00-8:30 PM", "assigned_instructor_ids": [inst1_id],
        "active": True, "created_at": now.isoformat()})

    dancers_data = [
        ("Aisha Sharma", "+91 98765 43210"), ("Rohan Patel", "+91 87654 32109"),
        ("Maya Singh", "+91 76543 21098"), ("Kiran Rao", "+91 65432 10987"),
        ("Dev Mehta", "+91 54321 09876"),
    ]
    dancer_ids = []
    for name, phone in dancers_data:
        did = str(uuid.uuid4())
        dancer_ids.append(did)
        await db.dancers.insert_one({"id": did, "full_name": name, "phone_number": phone,
            "notes": "", "active": True, "created_at": now.isoformat()})
        await db.enrollments.insert_one({"id": str(uuid.uuid4()), "dancer_id": did,
            "batch_id": batch_id, "active": True, "join_date": now.isoformat(),
            "created_at": now.isoformat()})

    # Aisha: Monthly active
    await db.passes.insert_one({"id": str(uuid.uuid4()), "dancer_id": dancer_ids[0], "batch_id": batch_id,
        "type": "monthly", "start_date": (now - timedelta(days=10)).isoformat(),
        "end_date": (now + timedelta(days=20)).isoformat(), "status": "active",
        "created_at": now.isoformat(), "created_by": inst1_id})
    # Rohan: Class Pack 8, 5 remaining
    await db.passes.insert_one({"id": str(uuid.uuid4()), "dancer_id": dancer_ids[1], "batch_id": batch_id,
        "type": "class_pack", "total_classes": 8, "remaining_classes": 5,
        "start_date": (now - timedelta(days=15)).isoformat(), "end_date": "",
        "status": "active", "created_at": now.isoformat(), "created_by": inst1_id})
    # Maya: Class Pack 8, 2 remaining (expiring soon)
    await db.passes.insert_one({"id": str(uuid.uuid4()), "dancer_id": dancer_ids[2], "batch_id": batch_id,
        "type": "class_pack", "total_classes": 8, "remaining_classes": 2,
        "start_date": (now - timedelta(days=20)).isoformat(), "end_date": "",
        "status": "active", "created_at": now.isoformat(), "created_by": inst1_id})
    # Kiran: Monthly expired
    await db.passes.insert_one({"id": str(uuid.uuid4()), "dancer_id": dancer_ids[3], "batch_id": batch_id,
        "type": "monthly", "start_date": (now - timedelta(days=40)).isoformat(),
        "end_date": (now - timedelta(days=10)).isoformat(), "status": "expired",
        "created_at": now.isoformat(), "created_by": inst1_id})
    # Dev: Drop-in unused
    await db.passes.insert_one({"id": str(uuid.uuid4()), "dancer_id": dancer_ids[4], "batch_id": batch_id,
        "type": "drop_in", "total_classes": 1, "remaining_classes": 1,
        "session_id": "", "valid_date": now.strftime("%Y-%m-%d"),
        "status": "unused", "created_at": now.isoformat(), "created_by": inst1_id})

    await db.settings.update_one({"id": "global"},
        {"$set": {"id": "global", "monthly_expiry_warning_days": 5, "class_pack_expiry_warning_remaining": 2}},
        upsert=True)

    return {"message": "Seeded successfully", "admin": "admin@aya.dance / admin123",
            "instructor1": "prerrna@aya.dance / instructor123", "instructor2": "arjun@aya.dance / instructor123"}

# ==================== APP CONFIG ====================
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"],
)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

@app.on_event("startup")
async def startup():
    await db.users.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.batches.create_index("id", unique=True)
    await db.dancers.create_index("id", unique=True)
    await db.enrollments.create_index("id", unique=True)
    await db.passes.create_index("id", unique=True)
    await db.sessions.create_index("id", unique=True)
    await db.attendance.create_index("id", unique=True)
    await db.audit_log.create_index("id", unique=True)
    logger.info("AYA Regulars Manager - Database indexes created")

@app.on_event("shutdown")
async def shutdown():
    client.close()
