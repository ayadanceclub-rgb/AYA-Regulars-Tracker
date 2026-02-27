import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Download } from "lucide-react";
import { toast } from "sonner";

export default function ReportsPage() {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [attReport, setAttReport] = useState([]);
  const [expiringReport, setExpiringReport] = useState({ expiring: [], expired: [] });

  useEffect(() => {
    api.get("/batches").then((r) => setBatches(r.data)).catch(() => {});
    api.get("/reports/expiring").then((r) => setExpiringReport(r.data)).catch(() => {});
  }, []);

  const loadAttendance = () => {
    const params = {};
    if (batchId) params.batch_id = batchId;
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    api.get("/reports/attendance", { params }).then((r) => setAttReport(r.data)).catch(() => {});
  };
  useEffect(loadAttendance, [batchId, startDate, endDate]);

  const handleCSV = async () => {
    try {
      const params = {};
      if (batchId) params.batch_id = batchId;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await api.get("/reports/csv", { params, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "attendance_report.csv";
      a.click();
      toast.success("CSV downloaded");
    } catch {
      toast.error("Export failed");
    }
  };

  const chartData = attReport.flatMap((b) =>
    b.sessions.map((s) => ({ date: s.date, present: s.present, absent: s.absent }))
  ).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-8" data-testid="reports-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Attendance analytics and exports</p>
        </div>
        <Button data-testid="export-csv-button" onClick={handleCSV} variant="outline" className="rounded-full h-10 px-6">
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={batchId} onValueChange={(v) => setBatchId(v === "all" ? "" : v)}>
          <SelectTrigger data-testid="report-batch-filter" className="w-48 rounded-xl h-10"><SelectValue placeholder="All batches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All batches</SelectItem>
            {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.batch_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40 rounded-xl h-10" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40 rounded-xl h-10" />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="rounded-2xl border-border/50">
          <CardHeader><CardTitle className="font-heading text-lg">Attendance Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="present" fill="hsl(0 0% 15%)" radius={[4, 4, 0, 0]} name="Present" />
                <Bar dataKey="absent" fill="hsl(0 0% 75%)" radius={[4, 4, 0, 0]} name="Absent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Batch summaries */}
      {attReport.map((b) => (
        <Card key={b.batch_id} className="rounded-2xl border-border/50">
          <CardContent className="p-6">
            <h3 className="font-heading font-semibold mb-1">{b.batch_name}</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {b.total_sessions} sessions | {b.total_present} present | {b.total_absent} absent |
              Rate: {b.total_sessions > 0 ? Math.round((b.total_present / (b.total_present + b.total_absent || 1)) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
      ))}

      {/* Expiring / Expired */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="rounded-2xl border-border/50">
          <CardHeader><CardTitle className="font-heading text-lg">Expiring Soon</CardTitle></CardHeader>
          <CardContent>
            {expiringReport.expiring.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <div className="space-y-2">
                {expiringReport.expiring.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{p.dancer_name}</p>
                      <p className="text-xs text-muted-foreground">{p.batch_name} - {p.type.replace("_", " ")}</p>
                    </div>
                    <Badge variant="outline" className="rounded-full text-xs">
                      {p.type === "class_pack" ? `${p.remaining_classes} left` : p.end_date?.slice(0, 10)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50">
          <CardHeader><CardTitle className="font-heading text-lg">Expired</CardTitle></CardHeader>
          <CardContent>
            {expiringReport.expired.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <div className="space-y-2">
                {expiringReport.expired.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{p.dancer_name}</p>
                      <p className="text-xs text-muted-foreground">{p.batch_name} - {p.type.replace("_", " ")}</p>
                    </div>
                    <Badge variant="secondary" className="rounded-full text-xs">Expired</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
