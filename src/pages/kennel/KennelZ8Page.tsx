import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Shield, Play, AlertTriangle } from "lucide-react";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  dry_run: boolean;
  kills_executed: number;
  scales_executed: number;
  rotations_executed: number;
  rollbacks_executed: number;
  retargeting_kills_executed: number;
  checkout_dropoffs_flagged: number;
  errors: number;
  daily_budget_freed_cents: number;
  summary: any;
  error_message: string | null;
};

export default function KennelZ8Page() {
  const [killSwitchOn, setKillSwitchOn] = useState(true);
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [ks, r] = await Promise.all([
      supabase.from("z8_kill_switch").select("enabled").eq("id", 1).maybeSingle(),
      supabase.from("z8_runs").select("*").order("started_at", { ascending: false }).limit(15),
    ]);
    setKillSwitchOn(ks.data?.enabled !== false);
    setRuns((r.data as Run[] | null) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleKillSwitch = async (next: boolean) => {
    const { error } = await supabase
      .from("z8_kill_switch")
      .update({
        enabled: next,
        paused_at: next ? null : new Date().toISOString(),
        resumed_at: next ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) { toast.error(error.message); return; }
    setKillSwitchOn(next);
    toast.success(next ? "Z8 auto-execution resumed." : "Z8 auto-execution paused.");
  };

  const runNow = async (dryRun: boolean) => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("z8-nightly-optimizer", {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      toast.success(
        `${dryRun ? "Dry run" : "Run"} complete · ${data?.kills ?? 0} kills · ${data?.scales ?? 0} scales · ${data?.rotations ?? 0} rotations`,
      );
      await load();
    } catch (e: any) { toast.error(e.message || "Run failed."); }
    finally { setRunning(false); }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" /> Z8 Nightly Optimizer
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Runs daily at 09:00 UTC (~04:00 ET). Auto-kills zero-purchase ads, scales winners +20%, rotates reserves, flags checkout drop-offs.
        </p>
      </div>

      <div className="border border-border bg-card p-5 flex items-center justify-between">
        <div>
          <div className="font-semibold text-foreground flex items-center gap-2">
            Auto-execution kill switch
            {!killSwitchOn && <span className="text-xs uppercase tracking-wide text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Paused</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            When off, Z8 still runs nightly but logs only — no Meta API writes.
          </p>
        </div>
        <Switch checked={killSwitchOn} onCheckedChange={toggleKillSwitch} disabled={loading} />
      </div>

      <div className="flex gap-3">
        <Button onClick={() => runNow(true)} variant="outline" disabled={running}>
          <Play className="h-4 w-4 mr-2" /> Run dry now
        </Button>
        <Button onClick={() => runNow(false)} disabled={running || !killSwitchOn}>
          <Play className="h-4 w-4 mr-2" /> Run live now
        </Button>
      </div>

      <div className="border border-border bg-card">
        <div className="px-5 py-3 border-b border-border font-semibold text-sm uppercase tracking-wide">Recent runs</div>
        <div className="divide-y divide-border">
          {runs.length === 0 && <div className="p-5 text-sm text-muted-foreground">No runs yet.</div>}
          {runs.map((r) => (
            <div key={r.id} className="px-5 py-3 text-sm">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                  {r.dry_run && <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">[dry]</span>}
                  <span className={`ml-2 text-xs uppercase tracking-wide ${r.status === "ok" ? "text-emerald-600" : r.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                    {r.status}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.kills_executed} kill · {r.scales_executed} scale · {r.rotations_executed} rotate · {r.rollbacks_executed} rollback · {r.checkout_dropoffs_flagged} drop-off · {r.retargeting_kills_executed} rtg-kill · {r.errors} err
                </div>
              </div>
              {r.error_message && <div className="text-xs text-destructive mt-1">{r.error_message}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}