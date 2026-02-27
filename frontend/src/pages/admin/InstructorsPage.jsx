import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Edit } from "lucide-react";

export default function InstructorsPage() {
  const [users, setUsers] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const load = () => { api.get("/users").then((r) => setUsers(r.data)).catch(() => {}); };
  useEffect(load, []);

  const openCreate = () => { setEditing(null); setForm({ name: "", email: "", password: "" }); setDialogOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ name: u.name, email: u.email, password: "" }); setDialogOpen(true); };

  const handleSave = async () => {
    try {
      if (editing) {
        const payload = { name: form.name, email: form.email };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editing.id}`, payload);
        toast.success("Instructor updated");
      } else {
        if (!form.password) { toast.error("Password required"); return; }
        await api.post("/users", form);
        toast.success("Instructor created");
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    }
  };

  const handleDeactivate = async (id) => {
    await api.delete(`/users/${id}`);
    toast.success("Instructor deactivated");
    load();
  };

  return (
    <div className="space-y-6" data-testid="instructors-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold">Instructors</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage instructor accounts</p>
        </div>
        <Button data-testid="create-instructor-button" onClick={openCreate} className="rounded-full h-10 px-6 active:scale-95 transition-all">
          <Plus className="h-4 w-4 mr-2" /> New Instructor
        </Button>
      </div>

      {users.length === 0 ? (
        <Card className="rounded-2xl"><CardContent className="p-12 text-center">
          <p className="text-muted-foreground">No instructors yet.</p>
        </CardContent></Card>
      ) : (
        <Card className="rounded-2xl border-border/50 overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} data-testid={`instructor-row-${u.id}`}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.active !== false ? "default" : "secondary"} className="rounded-full text-xs">
                      {u.active !== false ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => openEdit(u)} data-testid={`edit-instructor-${u.id}`}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit Instructor" : "New Instructor"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input data-testid="instructor-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl h-11" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input data-testid="instructor-email-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl h-11" />
            </div>
            <div className="space-y-2">
              <Label>{editing ? "New Password (leave blank to keep)" : "Password"}</Label>
              <Input data-testid="instructor-password-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-xl h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button data-testid="save-instructor-button" className="rounded-full" onClick={handleSave}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
