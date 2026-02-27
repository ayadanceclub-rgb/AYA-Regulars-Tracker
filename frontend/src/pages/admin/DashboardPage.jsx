import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Layers, Users, AlertCircle, Clock, Calendar } from "lucide-react";

const statConfig = [
  { key: "active_batches", label: "Active Batches", icon: Layers },
  { key: "total_dancers", label: "Total Dancers", icon: Users },
  { key: "expiring_soon", label: "Expiring Soon", icon: Clock },
  { key: "expired", label: "Expired Passes", icon: AlertCircle },
  { key: "today_sessions", label: "Today's Sessions", icon: Calendar },
];

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get("/notifications").then((r) => setNotifications(r.data.slice(0, 8))).catch(() => {});
  }, []);

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">AYA Regulars Manager dashboard</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statConfig.map((s, i) => (
          <Card
            key={s.key}
            className={`rounded-2xl border-border/50 shadow-sm animate-fade-in-delay-${Math.min(i, 4)}`}
            data-testid={`stat-${s.key}`}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl md:text-3xl font-heading font-bold">
                {stats ? stats[s.key] : "-"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Notifications */}
      <div>
        <h2 className="font-heading text-xl font-semibold mb-4">Recent Alerts</h2>
        {notifications.length === 0 ? (
          <Card className="rounded-2xl border-border/50">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground text-sm">No alerts at this time</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((n, i) => (
              <Card key={n.id + i} className="rounded-2xl border-border/50 shadow-sm">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                    n.type === "expired" ? "bg-foreground/10" : "bg-muted"
                  }`}>
                    {n.type === "expired" ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.dancer_name}</p>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{n.batch_name}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
