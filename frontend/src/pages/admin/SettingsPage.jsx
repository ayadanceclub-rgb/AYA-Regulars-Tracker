import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function SettingsPage() {
  const [settings, setSettings] = useState({ monthly_expiry_warning_days: 5, class_pack_expiry_warning_remaining: 2 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/settings", {
        monthly_expiry_warning_days: parseInt(settings.monthly_expiry_warning_days) || 5,
        class_pack_expiry_warning_remaining: parseInt(settings.class_pack_expiry_warning_remaining) || 2,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure notification thresholds</p>
      </div>

      <Card className="rounded-2xl border-border/50 max-w-md">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Expiry Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Monthly pass: warn X days before expiry</Label>
            <Input
              data-testid="settings-monthly-days"
              type="number"
              min={1}
              value={settings.monthly_expiry_warning_days}
              onChange={(e) => setSettings({ ...settings, monthly_expiry_warning_days: e.target.value })}
              className="rounded-xl h-11 w-24"
            />
            <p className="text-xs text-muted-foreground">Default: 5 days</p>
          </div>
          <div className="space-y-2">
            <Label>Class pack: warn when remaining classes &le; Y</Label>
            <Input
              data-testid="settings-pack-remaining"
              type="number"
              min={1}
              value={settings.class_pack_expiry_warning_remaining}
              onChange={(e) => setSettings({ ...settings, class_pack_expiry_warning_remaining: e.target.value })}
              className="rounded-xl h-11 w-24"
            />
            <p className="text-xs text-muted-foreground">Default: 2 classes</p>
          </div>
          <Button data-testid="save-settings-button" onClick={handleSave} disabled={saving} className="rounded-full h-11 px-8 active:scale-95 transition-all">
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
