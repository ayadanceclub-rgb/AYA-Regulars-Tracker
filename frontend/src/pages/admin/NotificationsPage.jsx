import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, AlertCircle, Clock } from "lucide-react";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    api.get("/notifications").then((r) => setNotifications(r.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6" data-testid="notifications-page">
      <div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold">Notifications</h1>
        <p className="text-muted-foreground text-sm mt-1">Pass renewal and expiry alerts</p>
      </div>

      {notifications.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-12 text-center space-y-3">
            <Bell className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">No notifications at this time</p>
            <p className="text-xs text-muted-foreground/60">Alerts will appear here when passes are expiring or expired</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n, i) => (
            <Card key={n.id + i} className="rounded-2xl border-border/50 shadow-sm" data-testid={`notification-${n.id}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                  n.type === "expired" ? "bg-foreground text-background" : "bg-muted"
                }`}>
                  {n.type === "expired" ? <AlertCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium">{n.dancer_name}</p>
                    <Badge variant={n.type === "expired" ? "default" : "outline"} className="rounded-full text-[10px]">
                      {n.type === "expired" ? "Expired" : "Expiring Soon"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{n.message}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{n.batch_name}</p>
                  <p className="text-[10px] text-muted-foreground/60 uppercase">{n.pass_type?.replace("_", " ")}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
