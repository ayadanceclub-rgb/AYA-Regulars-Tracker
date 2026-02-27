import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";

const ACTION_TYPES = [
  "create_dancer", "update_dancer", "deactivate_dancer",
  "create_enrollment", "remove_dancer_from_batch",
  "create_pass", "renew_pass", "mark_attendance",
  "create_batch", "update_batch", "deactivate_batch",
  "create_instructor", "update_instructor", "deactivate_instructor",
  "update_settings"
];

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action_type: "", start_date: "", end_date: "" });
  const [detailLog, setDetailLog] = useState(null);
  const limit = 20;

  const load = () => {
    const params = { page, limit };
    if (filters.action_type) params.action_type = filters.action_type;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    api.get("/audit-log", { params }).then((r) => {
      setLogs(r.data.logs);
      setTotal(r.data.total);
    }).catch(() => {});
  };
  useEffect(load, [page, filters]);

  const formatDate = (iso) => {
    if (!iso) return "-";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  return (
    <div className="space-y-6" data-testid="audit-log-page">
      <div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground text-sm mt-1">Track all actions and changes</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={filters.action_type} onValueChange={(v) => { setFilters({ ...filters, action_type: v === "all" ? "" : v }); setPage(1); }}>
          <SelectTrigger data-testid="audit-filter-action" className="w-48 rounded-xl h-10">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTION_TYPES.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" data-testid="audit-filter-start" value={filters.start_date} onChange={(e) => { setFilters({ ...filters, start_date: e.target.value }); setPage(1); }} className="w-40 rounded-xl h-10" />
        <Input type="date" data-testid="audit-filter-end" value={filters.end_date} onChange={(e) => { setFilters({ ...filters, end_date: e.target.value }); setPage(1); }} className="w-40 rounded-xl h-10" />
      </div>

      <Card className="rounded-2xl border-border/50 overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No logs found</TableCell></TableRow>
            ) : logs.map((l) => (
              <TableRow key={l.id} data-testid={`audit-row-${l.id}`}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(l.timestamp)}</TableCell>
                <TableCell className="text-sm">{l.actor_name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full text-xs">{l.action_type.replace(/_/g, " ")}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.entity_type}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="rounded-full h-7 w-7" onClick={() => setDetailLog(l)} data-testid={`audit-detail-${l.id}`}>
                    <Eye className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} total entries</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-full" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm py-1.5">Page {page}</span>
          <Button variant="outline" size="sm" className="rounded-full" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={!!detailLog} onOpenChange={() => setDetailLog(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">Action Detail</DialogTitle></DialogHeader>
          {detailLog && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Action:</span> <span className="font-medium">{detailLog.action_type.replace(/_/g, " ")}</span></div>
                <div><span className="text-muted-foreground">Actor:</span> <span className="font-medium">{detailLog.actor_name}</span></div>
                <div><span className="text-muted-foreground">Entity:</span> <span className="font-medium">{detailLog.entity_type}</span></div>
                <div><span className="text-muted-foreground">Time:</span> <span className="font-medium">{formatDate(detailLog.timestamp)}</span></div>
              </div>
              {detailLog.metadata && Object.keys(detailLog.metadata).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Details</h4>
                  <pre className="bg-muted rounded-xl p-3 text-xs overflow-auto max-h-60">
                    {JSON.stringify(detailLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
