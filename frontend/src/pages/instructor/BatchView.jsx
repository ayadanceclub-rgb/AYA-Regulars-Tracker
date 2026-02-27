import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Check, X, Search, UserPlus, RefreshCw,
  CheckCircle2, Clock, AlertCircle, Users, Calendar
} from "lucide-react";

function PassBadge({ pass }) {
  if (!pass) return <span className="text-[10px] text-muted-foreground/60 uppercase">No Pass</span>;
  const s = pass.computed_status || "unknown";
  const t = pass.type?.replace("_", " ");
  const label = s === "active" ? t : s === "expiring_soon" ? `${t} - low` : `${t} - expired`;
  const extra = pass.type === "class_pack" ? ` (${pass.remaining_classes})` : "";
  return (
    <Badge
      variant={s === "active" ? "default" : s === "expiring_soon" ? "outline" : "secondary"}
      className="rounded-full text-[10px]"
    >
      {label}{extra}
    </Badge>
  );
}

/* ============== TODAY TAB (Attendance) ============== */
function TodayTab({ batchId, batch }) {
  const [session, setSession] = useState(null);
  const [dancers, setDancers] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [searchQ, setSearchQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [dropinOpen, setDropinOpen] = useState(false);
  const [dropinForm, setDropinForm] = useState({ full_name: "", phone_number: "" });

  const load = useCallback(async () => {
    try {
      const sRes = await api.get("/sessions/today", { params: { batch_id: batchId } });
      setSession(sRes.data);
      const dRes = await api.get("/dancers", { params: { batch_id: batchId } });
      setDancers(dRes.data);
      const aRes = await api.get("/attendance", { params: { session_id: sRes.data.id } });
      const map = {};
      aRes.data.forEach((a) => { map[a.dancer_id] = a.status; });
      setAttendance(map);
    } catch {
      toast.error("Failed to load session");
    }
  }, [batchId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (did) => {
    setAttendance((prev) => ({
      ...prev,
      [did]: prev[did] === "present" ? "absent" : "present",
    }));
  };

  const markAllPresent = () => {
    const map = {};
    dancers.forEach((d) => { map[d.id] = "present"; });
    setAttendance(map);
  };

  const saveAttendance = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const records = dancers.map((d) => ({
        dancer_id: d.id,
        status: attendance[d.id] || "absent",
      }));
      const res = await api.post("/attendance/bulk", {
        session_id: session.id,
        batch_id: batchId,
        records,
      });
      setWarnings(res.data.warnings || []);
      setSummaryOpen(true);
      toast.success("Attendance saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const addDropin = async () => {
    if (!dropinForm.full_name.trim()) { toast.error("Name required"); return; }
    try {
      const dRes = await api.post("/dancers", { ...dropinForm, batch_id: batchId });
      await api.post("/passes", {
        dancer_id: dRes.data.id, batch_id: batchId,
        type: "drop_in", session_id: session?.id || "",
      });
      setDropinOpen(false);
      setDropinForm({ full_name: "", phone_number: "" });
      await load();
      setAttendance((prev) => ({ ...prev, [dRes.data.id]: "present" }));
      toast.success("Drop-in added");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add drop-in");
    }
  };

  const filtered = dancers.filter((d) => {
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (!d.full_name.toLowerCase().includes(q) && !(d.phone_number || "").includes(q)) return false;
    }
    if (filter === "present") return attendance[d.id] === "present";
    if (filter === "absent") return attendance[d.id] === "absent" || !attendance[d.id];
    if (filter === "expired") return d.active_pass?.computed_status === "expired" || !d.active_pass;
    if (filter === "unmarked") return !attendance[d.id];
    return true;
  });

  const presentCount = dancers.filter((d) => attendance[d.id] === "present").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
            {session?.date || "Today"} Session
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">{presentCount}/{dancers.length} present</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setDropinOpen(true)} data-testid="add-dropin-button">
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Drop-in
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={markAllPresent} data-testid="mark-all-present-button">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> All Present
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="attendance-search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search..."
            className="pl-9 h-10 rounded-xl text-sm"
          />
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {["all", "present", "absent", "unmarked", "expired"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            className="rounded-full text-xs h-8 px-3 shrink-0"
            onClick={() => setFilter(f)}
            data-testid={`filter-${f}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {/* Dancer list */}
      <div className="space-y-1">
        {filtered.map((d) => {
          const isPresent = attendance[d.id] === "present";
          return (
            <div
              key={d.id}
              data-testid={`attendance-row-${d.id}`}
              className="flex items-center justify-between py-3 px-3 border-b border-border last:border-0"
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium truncate">{d.full_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <PassBadge pass={d.active_pass} />
                </div>
              </div>
              <button
                data-testid={`toggle-${d.id}`}
                onClick={() => toggle(d.id)}
                className={`attendance-toggle h-12 w-12 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isPresent
                    ? "bg-foreground border-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {isPresent ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No dancers found</p>
        )}
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 bg-background/80 backdrop-blur-md border-t border-border py-3 -mx-4 px-4 mt-4">
        <Button
          data-testid="save-attendance-button"
          onClick={saveAttendance}
          disabled={saving}
          className="w-full h-12 rounded-full font-medium text-base active:scale-95 transition-all"
        >
          {saving ? "Saving..." : `Save Attendance (${presentCount}/${dancers.length})`}
        </Button>
      </div>

      {/* Summary Dialog */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Attendance Summary</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-center">
              <Card className="rounded-xl"><CardContent className="p-3">
                <p className="text-2xl font-heading font-bold">{presentCount}</p>
                <p className="text-xs text-muted-foreground">Present</p>
              </CardContent></Card>
              <Card className="rounded-xl"><CardContent className="p-3">
                <p className="text-2xl font-heading font-bold">{dancers.length - presentCount}</p>
                <p className="text-xs text-muted-foreground">Absent</p>
              </CardContent></Card>
            </div>
            {warnings.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2 text-muted-foreground">Warnings</p>
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{w.message || w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button className="rounded-full w-full" onClick={() => setSummaryOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drop-in Dialog */}
      <Dialog open={dropinOpen} onOpenChange={setDropinOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Add Drop-in</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input data-testid="dropin-name-input" value={dropinForm.full_name} onChange={(e) => setDropinForm({ ...dropinForm, full_name: e.target.value })} className="rounded-xl h-11" placeholder="Dancer name" />
            </div>
            <div className="space-y-2">
              <Label>Phone (optional)</Label>
              <Input data-testid="dropin-phone-input" value={dropinForm.phone_number} onChange={(e) => setDropinForm({ ...dropinForm, phone_number: e.target.value })} className="rounded-xl h-11" placeholder="+91..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setDropinOpen(false)}>Cancel</Button>
            <Button data-testid="save-dropin-button" className="rounded-full" onClick={addDropin}>Add & Mark Present</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============== DANCERS TAB ============== */
function DancersTab({ batchId }) {
  const [dancers, setDancers] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [selectedDancer, setSelectedDancer] = useState(null);
  const [form, setForm] = useState({ full_name: "", phone_number: "", notes: "" });
  const [passForm, setPassForm] = useState({ type: "monthly", total_classes: 8 });

  const load = useCallback(() => {
    api.get("/dancers", { params: { batch_id: batchId } }).then((r) => setDancers(r.data)).catch(() => {});
  }, [batchId]);
  useEffect(() => { load(); }, [load]);

  const addDancer = async () => {
    if (!form.full_name.trim()) { toast.error("Name required"); return; }
    try {
      await api.post("/dancers", { ...form, batch_id: batchId });
      setAddOpen(false);
      setForm({ full_name: "", phone_number: "", notes: "" });
      load();
      toast.success("Dancer added");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    }
  };

  const removeDancer = async (d) => {
    if (!d.enrollment?.id) return;
    try {
      await api.put(`/enrollments/${d.enrollment.id}/deactivate`);
      load();
      toast.success("Dancer removed from batch");
    } catch {
      toast.error("Error removing dancer");
    }
  };

  const openPassDialog = (d) => {
    setSelectedDancer(d);
    setPassForm({ type: "monthly", total_classes: 8 });
    setPassOpen(true);
  };

  const assignPass = async () => {
    if (!selectedDancer) return;
    try {
      await api.post("/passes", {
        dancer_id: selectedDancer.id,
        batch_id: batchId,
        type: passForm.type,
        total_classes: passForm.type === "class_pack" ? parseInt(passForm.total_classes) : undefined,
      });
      setPassOpen(false);
      load();
      toast.success("Pass assigned");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    }
  };

  const renewPass = async (d) => {
    if (!d.active_pass?.id) return;
    try {
      await api.put(`/passes/${d.active_pass.id}/renew`, {
        total_classes: d.active_pass.total_classes,
      });
      load();
      toast.success("Pass renewed");
    } catch {
      toast.error("Error renewing pass");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">{dancers.length} Dancers</p>
        <Button size="sm" className="rounded-full" onClick={() => setAddOpen(true)} data-testid="add-dancer-button">
          <UserPlus className="h-3.5 w-3.5 mr-1" /> Add Dancer
        </Button>
      </div>

      <div className="space-y-1">
        {dancers.map((d) => (
          <div key={d.id} className="flex items-center justify-between py-3 px-2 border-b border-border last:border-0" data-testid={`dancer-item-${d.id}`}>
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-sm font-medium truncate">{d.full_name}</p>
              <p className="text-xs text-muted-foreground">{d.phone_number || "-"}</p>
              <PassBadge pass={d.active_pass} />
            </div>
            <div className="flex gap-1 shrink-0">
              {(!d.active_pass || d.active_pass.computed_status === "expired") ? (
                <Button variant="outline" size="sm" className="rounded-full text-xs h-8" onClick={() => openPassDialog(d)} data-testid={`assign-pass-${d.id}`}>
                  Assign Pass
                </Button>
              ) : (d.active_pass.computed_status === "expiring_soon" || d.active_pass.computed_status === "expired") ? (
                <Button variant="outline" size="sm" className="rounded-full text-xs h-8" onClick={() => renewPass(d)} data-testid={`renew-pass-${d.id}`}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Renew
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" className="rounded-full text-xs h-8 text-muted-foreground" onClick={() => removeDancer(d)} data-testid={`remove-dancer-${d.id}`}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        {dancers.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No dancers in this batch yet</p>}
      </div>

      {/* Add Dancer Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Add Dancer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input data-testid="new-dancer-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="rounded-xl h-11" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input data-testid="new-dancer-phone" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} className="rounded-xl h-11" placeholder="+91..." />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-xl h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button data-testid="save-new-dancer-button" className="rounded-full" onClick={addDancer}>Add Dancer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Pass Dialog */}
      <Dialog open={passOpen} onOpenChange={setPassOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Assign Pass - {selectedDancer?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pass Type</Label>
              <Select value={passForm.type} onValueChange={(v) => setPassForm({ ...passForm, type: v })}>
                <SelectTrigger data-testid="pass-type-select" className="rounded-xl h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly Unlimited</SelectItem>
                  <SelectItem value="class_pack">Class Pack</SelectItem>
                  <SelectItem value="drop_in">Drop-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {passForm.type === "class_pack" && (
              <div className="space-y-2">
                <Label>Total Classes</Label>
                <Input data-testid="pass-total-classes" type="number" value={passForm.total_classes} onChange={(e) => setPassForm({ ...passForm, total_classes: e.target.value })} className="rounded-xl h-11 w-24" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setPassOpen(false)}>Cancel</Button>
            <Button data-testid="confirm-assign-pass" className="rounded-full" onClick={assignPass}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============== HISTORY TAB ============== */
function HistoryTab({ batchId }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    api.get("/sessions", { params: { batch_id: batchId } }).then((r) => setSessions(r.data)).catch(() => {});
  }, [batchId]);

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">{sessions.length} Past Sessions</p>
      {sessions.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">No sessions yet</p>
      ) : (
        sessions.map((s) => (
          <Card key={s.id} className="rounded-2xl border-border/50" data-testid={`session-${s.id}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{s.date}</p>
                  <p className="text-xs text-muted-foreground">{s.total} marked</p>
                </div>
              </div>
              <div className="flex gap-3 text-sm">
                <span className="font-medium">{s.present_count} <span className="text-muted-foreground text-xs">present</span></span>
                <span className="font-medium">{s.absent_count} <span className="text-muted-foreground text-xs">absent</span></span>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

/* ============== MAIN BATCH VIEW ============== */
export default function BatchView() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);

  useEffect(() => {
    api.get(`/batches/${batchId}`).then((r) => setBatch(r.data)).catch(() => navigate("/instructor/home"));
  }, [batchId, navigate]);

  if (!batch) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4" data-testid="batch-view">
      <button onClick={() => navigate("/instructor/home")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="back-button">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div>
        <h1 className="font-heading text-2xl font-bold">{batch.batch_name}</h1>
        <p className="text-sm text-muted-foreground">{batch.studio_name} &middot; {batch.schedule_days} {batch.time_slot}</p>
      </div>

      <Tabs defaultValue="today" className="w-full">
        <TabsList className="grid w-full grid-cols-3 rounded-xl bg-muted h-10">
          <TabsTrigger value="today" data-testid="tab-today" className="rounded-lg text-sm">Today</TabsTrigger>
          <TabsTrigger value="dancers" data-testid="tab-dancers" className="rounded-lg text-sm">Dancers</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history" className="rounded-lg text-sm">History</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="mt-4">
          <TodayTab batchId={batchId} batch={batch} />
        </TabsContent>
        <TabsContent value="dancers" className="mt-4">
          <DancersTab batchId={batchId} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab batchId={batchId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
