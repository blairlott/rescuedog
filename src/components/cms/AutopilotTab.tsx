import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, Sparkles } from "lucide-react";

type AutopilotState = {
  enabled: boolean;
  cadence_hours: number;
  min_exposures_per_arm: number;
  confidence_threshold: number;
  alert_email: string;
  last_autopilot_run_at: string | null;
  last_harvest_legacy_at: string | null;
  last_harvest_instagram_at: string | null;
};

type Template = {
  id: string;
  slot_key: string;
  name: string;
  description: string | null;
  variant_configs: Array<{ key: string; name: string }>;
  use_media_pool: boolean;
  enabled: boolean;
};

export default function AutopilotTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  const stateQuery = useQuery({
    queryKey: ["autopilot-state"],
    queryFn: async () => {
      const { data, error } = await supabase.from("autopilot_state").select("*").eq("id", 1).single();
      if (error) throw error;
      return data as AutopilotState;
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["autopilot-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("experiment_templates").select("*").order("slot_key");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  async function updateState(patch: Partial<AutopilotState>) {
    const { error } = await supabase.from("autopilot_state").update(patch).eq("id", 1);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["autopilot-state"] });
  }

  async function runNow() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("experiments-autopilot", { body: {} });
      if (error) throw error;
      toast({
        title: "Autopilot ran",
        description: `Closed ${data?.closed ?? 0}, spawned ${data?.spawned ?? 0}.`,
      });
      qc.invalidateQueries({ queryKey: ["autopilot-state"] });
      qc.invalidateQueries({ queryKey: ["cms-experiments"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Autopilot failed", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  async function toggleTemplate(id: string, enabled: boolean) {
    await supabase.from("experiment_templates").update({ enabled }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["autopilot-templates"] });
  }

  const s = stateQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Self-Optimization Autopilot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!s ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Enabled</Label>
                  <p className="text-xs text-muted-foreground">Auto-close winning experiments and spawn new ones from templates.</p>
                </div>
                <Switch checked={s.enabled} onCheckedChange={(v) => updateState({ enabled: v })} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Cadence (hours between new experiments per slot)</Label>
                  <Input type="number" defaultValue={s.cadence_hours}
                    onBlur={(e) => updateState({ cadence_hours: Number(e.target.value) || 72 })} />
                </div>
                <div>
                  <Label className="text-xs">Min exposures per arm</Label>
                  <Input type="number" defaultValue={s.min_exposures_per_arm}
                    onBlur={(e) => updateState({ min_exposures_per_arm: Number(e.target.value) || 100 })} />
                </div>
                <div>
                  <Label className="text-xs">Confidence to close (0–1)</Label>
                  <Input type="number" step="0.01" min="0.5" max="0.99" defaultValue={s.confidence_threshold}
                    onBlur={(e) => updateState({ confidence_threshold: Number(e.target.value) || 0.9 })} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Alert email</Label>
                <Input type="email" defaultValue={s.alert_email}
                  onBlur={(e) => updateState({ alert_email: e.target.value })} />
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Last autopilot run: <span className="font-mono">{s.last_autopilot_run_at ? new Date(s.last_autopilot_run_at).toLocaleString() : "never"}</span></p>
                <p>Last legacy scan: <span className="font-mono">{s.last_harvest_legacy_at ? new Date(s.last_harvest_legacy_at).toLocaleString() : "never"}</span></p>
                <p>Last Instagram scan: <span className="font-mono">{s.last_harvest_instagram_at ? new Date(s.last_harvest_instagram_at).toLocaleString() : "never"}</span></p>
              </div>

              <Button onClick={runNow} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                Run autopilot now
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Experiment Templates</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Recipes the autopilot uses to spawn new experiments. Each template has variant configs. Toggle off to pause auto-spawning for that slot.
          </p>
          <div className="space-y-3">
            {(templatesQuery.data ?? []).map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-4 p-3 border rounded-none">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{t.name}</span>
                    <Badge variant="outline" className="text-[10px]">{t.slot_key}</Badge>
                    {t.use_media_pool && <Badge className="text-[10px]">uses media pool</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{t.variant_configs?.length ?? 0} variants</Badge>
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                </div>
                <Switch checked={t.enabled} onCheckedChange={(v) => toggleTemplate(t.id, v)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}