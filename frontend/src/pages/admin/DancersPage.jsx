import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Eye } from "lucide-react";

export default function DancersPage() {
  const [dancers, setDancers] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadDancers = () => {
    api.get("/dancers", { params: { search: search || undefined } }).then((r) => setDancers(r.data)).catch(() => {});
  };
  // reload whenever the search term changes
  useEffect(loadDancers, [search]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadDancers();
  };

  const openDetail = (d) => {
    api.get(`/dancers/${d.id}`).then((r) => { setSelected(r.data); setDetailOpen(true); }).catch(() => {});
  };

  const passStatusBadge = (passes) => {
    if (!passes || passes.length === 0) return <Badge variant="outline" className="rounded-full text-xs">No Pass</Badge>;
    const active = passes.find((p) => p.computed_status === "active");
    if (active) return <Badge className="rounded-full text-xs">Active ({active.type.replace("_", " ")})</Badge>;
    const expiring = passes.find((p) => p.computed_status === "expiring_soon");
    if (expiring) return <Badge variant="outline" className="rounded-full text-xs">Expiring ({expiring.type.replace("_", " ")})</Badge>;
    const expired = passes.find((p) => p.computed_status === "expired");
    if (expired) return <Badge variant="secondary" className="rounded-full text-xs">Expired</Badge>;
    return <Badge variant="outline" className="rounded-full text-xs">-</Badge>;
  };

  return (
    <div className="space-y-6" data-testid="dancers-page">
      <div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold">Dancers</h1>
        <p className="text-muted-foreground text-sm mt-1">View all dancers across batches</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="dancers-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="pl-9 h-11 rounded-xl"
          />
        </div>
        <Button type="submit" variant="outline" className="rounded-full h-11">Search</Button>
      </form>

      {dancers.length === 0 ? (
        <Card className="rounded-2xl border-border/50"><CardContent className="p-12 text-center">
          <p className="text-muted-foreground">No dancers found. Dancers are added by instructors from their batch view.</p>
        </CardContent></Card>
      ) : (
        <Card className="rounded-2xl border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead>Pass Status</TableHead>
                <TableHead className="hidden md:table-cell">Attendance</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dancers.map((d) => (
                <TableRow key={d.id} data-testid={`dancer-row-${d.id}`}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{d.full_name}</p>
                      <p className="text-xs text-muted-foreground md:hidden">{d.phone_number}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{d.phone_number}</TableCell>
                  <TableCell>{passStatusBadge(d.passes)}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {d.present_count !== undefined ? `${d.present_count}/${d.total_sessions}` : "-"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => openDetail(d)} data-testid={`view-dancer-${d.id}`}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{selected?.full_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{selected.phone_number || "-"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{selected.active ? "Active" : "Inactive"}</span></div>
                <div><span className="text-muted-foreground">Sessions:</span> <span className="font-medium">{selected.total_sessions}</span></div>
                <div><span className="text-muted-foreground">Present:</span> <span className="font-medium">{selected.present_count}</span></div>
              </div>
              {selected.notes && <div><span className="text-muted-foreground">Notes:</span> <p>{selected.notes}</p></div>}
              <div>
                <h4 className="font-medium mb-2">Enrollments</h4>
                {selected.enrollments?.length > 0 ? selected.enrollments.map((e) => (
                  <Badge key={e.id} variant="outline" className="rounded-full mr-1 mb-1">{e.batch_id.slice(0, 8)}...</Badge>
                )) : <p className="text-muted-foreground">No enrollments</p>}
              </div>
              <div>
                <h4 className="font-medium mb-2">Passes</h4>
                {selected.passes?.length > 0 ? selected.passes.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <span className="capitalize">{p.type.replace("_", " ")}</span>
                    <Badge variant={p.computed_status === "active" ? "default" : p.computed_status === "expiring_soon" ? "outline" : "secondary"} className="rounded-full text-xs">
                      {p.computed_status}{p.type === "class_pack" ? ` (${p.remaining_classes}/${p.total_classes})` : ""}
                    </Badge>
                  </div>
                )) : <p className="text-muted-foreground">No passes</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
