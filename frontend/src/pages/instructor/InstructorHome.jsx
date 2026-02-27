import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, AlertCircle, Clock, ChevronRight } from "lucide-react";

export default function InstructorHome() {
  const [batches, setBatches] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/batches").then((r) => setBatches(r.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6" data-testid="instructor-home">
      <div>
        <h1 className="font-heading text-3xl font-bold">My Batches</h1>
        <p className="text-muted-foreground text-sm mt-1">Select a batch to manage</p>
      </div>

      {batches.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No batches assigned to you yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {batches.map((b) => (
            <Card
              key={b.id}
              className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98]"
              data-testid={`instructor-batch-card-${b.id}`}
              onClick={() => navigate(`/instructor/batch/${b.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading text-lg font-semibold">{b.batch_name}</h3>
                    <p className="text-sm text-muted-foreground">{b.studio_name}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground mt-1" />
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{b.schedule_days} {b.time_slot}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    <span>{b.dancer_count || 0} dancers</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {b.expiring_soon_count > 0 && (
                      <Badge variant="outline" className="rounded-full text-xs">
                        <Clock className="h-3 w-3 mr-1" />{b.expiring_soon_count} expiring
                      </Badge>
                    )}
                    {b.expired_count > 0 && (
                      <Badge variant="outline" className="rounded-full text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />{b.expired_count} expired
                      </Badge>
                    )}
                  </div>
                  <Button size="sm" className="rounded-full h-9 px-5 active:scale-95 transition-all" data-testid={`take-attendance-${b.id}`}>
                    Take Attendance
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
