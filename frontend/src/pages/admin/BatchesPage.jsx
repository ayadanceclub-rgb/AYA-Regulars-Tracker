import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Edit, Users, Clock, AlertCircle } from "lucide-react";

export default function BatchesPage() {
  const [batches, setBatches] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ batch_name: "", studio_name: "", schedule_days: "", time_slot: "", assigned_instructor_ids: [] });

  const loadData = () => {
    api.get("/batches").then((r) => setBatches(r.data)).catch(() => {});
    api.get("/users").then((r) => setInstructors(r.data)).catch(() => {});
  };
  useEffect(loadData, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ batch_name: "", studio_name: "", schedule_days: "", time_slot: "", assigned_instructor_ids: [] });
    setDialogOpen(true);
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({ batch_name: b.batch_name, studio_name: b.studio_name, schedule_days: b.schedule_days, time_slot: b.time_slot, assigned_instructor_ids: b.assigned_instructor_ids || [] });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await api.put(`/batches/${editing.id}`, form);
        toast.success("Batch updated");
      } else {
        await api.post("/batches", form);
        toast.success("Batch created");
      }
      setDialogOpen(false);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error saving batch");
    }
  };

  const handleDeactivate = async (id) => {
    try {
      await api.delete(`/batches/${id}`);
      toast.success("Batch deactivated");
      loadData();
    } catch (e) {
      toast.error("Error deactivating batch");
    }
  };

  return (
    <div className="space-y-6" data-testid="batches-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold">Batches</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage dance batches</p>
        </div>
        <Button data-testid="create-batch-button" onClick={openCreate} className="rounded-full h-10 px-6 active:scale-95 transition-all">
          <Plus className="h-4 w-4 mr-2" /> New Batch
        </Button>
      </div>

      {batches.length === 0 ? (
        <Card className="rounded-2xl border-border/50"><CardContent className="p-12 text-center">
          <p className="text-muted-foreground">No batches yet. Create your first batch.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {batches.map((b) => (
            <Card key={b.id} className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow" data-testid={`batch-card-${b.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-heading text-lg font-semibold">{b.batch_name}</h3>
                    <p className="text-sm text-muted-foreground">{b.studio_name}</p>
                  </div>
                  <Badge variant={b.active ? "default" : "secondary"} className="rounded-full">
                    {b.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{b.schedule_days} {b.time_slot}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>{b.dancer_count || 0} dancers</span>
                  </div>
                </div>
                {(b.expiring_soon_count > 0 || b.expired_count > 0) && (
                  <div className="flex gap-2 mb-4">
                    {b.expiring_soon_count > 0 && (
                      <Badge variant="outline" className="rounded-full text-xs">{b.expiring_soon_count} expiring</Badge>
                    )}
                    {b.expired_count > 0 && (
                      <Badge variant="outline" className="rounded-full text-xs">{b.expired_count} expired</Badge>
                    )}
                  </div>
                )}
                {b.instructors?.length > 0 && (
                  <p className="text-xs text-muted-foreground mb-4">
                    Instructor: {b.instructors.map((i) => i.name).join(", ")}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => openEdit(b)} data-testid={`edit-batch-${b.id}`}>
                    <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  {b.active && (
                    <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => handleDeactivate(b.id)}>
                      Deactivate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? "Edit Batch" : "Create Batch"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Batch Name</Label>
              <Input data-testid="batch-name-input" value={form.batch_name} onChange={(e) => setForm({ ...form, batch_name: e.target.value })} className="rounded-xl h-11" placeholder="e.g. Open-Style Batch" />
            </div>
            <div className="space-y-2">
              <Label>Studio Name</Label>
              <Input data-testid="batch-studio-input" value={form.studio_name} onChange={(e) => setForm({ ...form, studio_name: e.target.value })} className="rounded-xl h-11" placeholder="e.g. Prerrna Dance Studios" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Schedule Days</Label>
                <Input data-testid="batch-days-input" value={form.schedule_days} onChange={(e) => setForm({ ...form, schedule_days: e.target.value })} className="rounded-xl h-11" placeholder="e.g. Tue/Thu" />
              </div>
              <div className="space-y-2">
                <Label>Time Slot</Label>
                <Input data-testid="batch-time-input" value={form.time_slot} onChange={(e) => setForm({ ...form, time_slot: e.target.value })} className="rounded-xl h-11" placeholder="e.g. 7:00-8:30 PM" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assign Instructor</Label>
              <Select
                value={form.assigned_instructor_ids[0] || ""}
                onValueChange={(v) => setForm({ ...form, assigned_instructor_ids: v ? [v] : [] })}
              >
                <SelectTrigger data-testid="batch-instructor-select" className="rounded-xl h-11">
                  <SelectValue placeholder="Select instructor" />
                </SelectTrigger>
                <SelectContent>
                  {instructors.filter(i => i.active !== false).map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button data-testid="save-batch-button" className="rounded-full" onClick={handleSave}>
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
