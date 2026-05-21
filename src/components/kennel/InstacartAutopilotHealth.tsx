import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/kennel/MetricCard";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Briefcase, Play, Bell, CheckCircle2, Plus, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Evaluation = {
  id: string;
  ran_at: string;
  enabled_before: boolean;
  enabled_after: boolean;
  error_pct: number | null;
  error_sample: number | null;
  trailing_roas: number | null;
  trailing_spend_cents: number | null;
  trailing_sales_cents: number | null;
  candidates_considered: number | null;
  eligible: number | null;
  executed: number | null;
  budget_remaining: number | null;
  b2b_mode: string | null;
  b2b_eligible: number | null;
  auto_stopped: boolean;
  auto_stop_reason: string | null;
  notification_sent: boolean;
  detail: any;
};

function dollars(c: number | null | undefined) {
  return `$${((c ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function InstacartAutopilotHealth() {
  const qc = useQueryClient();
  const [acknowledging, setAcknowledging] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ["instacart-autopilot-settings-ext"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings" as any).select("key,value")
        .in("key", [
          "instacart_autopilot_enabled",
          "instacart_autopilot_auto_stopped_at",
          "instacart_autopilot_auto_stopped_reason",
          "instacart_autopilot_b2b_mode",
          "instacart_autopilot_b2b_max_bid_change_pct",
          "instacart_autopilot_b2b_daily_cap",
          "instacart_autopilot_b2b_auto_stop_enabled",
          "instacart_autopilot_b2b_max_error_rate_pct",
          "instacart_autopilot_b2b_min_roas",
          "instacart_autopilot_b2b_account_overrides",
          "instacart_autopilot_max_error_rate_pct",
          "instacart_autopilot_min_roas",
          "instacart_autopilot_roas_window_days",
          "instacart_autopilot_error_rate_window",
          "instacart_autopilot_min_actions_for_eval",
        ]);
      return (data as any[]) ?? [];
    },
  });
  const cfg = useMemo(() => {
    const m: Record<string, any> = {};
    settings.forEach((r: any) => { m[r.key] = r.value; });
    return {
      enabled: m.instacart_autopilot_enabled === true,
      stoppedAt: m.instacart_autopilot_auto_stopped_at as string | null,
      stoppedReason: m.instacart_autopilot_auto_stopped_reason as any,
      b2bMode: (m.instacart_autopilot_b2b_mode ?? "include") as "include" | "exclude" | "only",
      b2bMaxBidPct: Number(m.instacart_autopilot_b2b_max_bid_change_pct ?? 10),
      b2bDailyCap: Number(m.instacart_autopilot_b2b_daily_cap ?? 5),
      b2bAutoStop: m.instacart_autopilot_b2b_auto_stop_enabled !== false,
      b2bMaxErrorPct: Number(m.instacart_autopilot_b2b_max_error_rate_pct ?? 15),
      b2bMinRoas: Number(m.instacart_autopilot_b2b_min_roas ?? 2.0),
      b2bAccountOverrides: (m.instacart_autopilot_b2b_account_overrides ?? {}) as Record<string, {
        label?: string; autoStop?: boolean; maxErrorPct?: number; minRoas?: number;
      }>,
      maxErrorPct: Number(m.instacart_autopilot_max_error_rate_pct ?? 25),
      minRoas: Number(m.instacart_autopilot_min_roas ?? 1.5),
      roasWindowDays: Number(m.instacart_autopilot_roas_window_days ?? 7),
      errorWindow: Number(m.instacart_autopilot_error_rate_window ?? 50),
      minActions: Number(m.instacart_autopilot_min_actions_for_eval ?? 10),
    };
  }, [settings]);

  const { data: evals = [] } = useQuery({
    queryKey: ["instacart-autopilot-evals"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_autopilot_evaluations" as any)
        .select("*").eq("platform", "instacart")
        .order("ran_at", { ascending: false }).limit(50);
      return (data as any[]) as Evaluation[];
    },
    refetchInterval: 30_000,
  });

  const latest = evals[0];
  const last24 = useMemo(() => {
    const cutoff = Date.now() - 24 * 3_600_000;
    return evals.filter(e => new Date(e.ran_at).getTime() >= cutoff);
  }, [evals]);

  const tiles = useMemo(() => {
    const executed24 = last24.reduce((s, e) => s + (e.executed ?? 0), 0);
    const b2b24 = last24.reduce((s, e) => s + (e.b2b_eligible ?? 0), 0);
    const errPct = latest?.error_pct;
    const roas = latest?.trailing_roas;
    const stopped = !!cfg.stoppedAt && !cfg.enabled;
    return { executed24, b2b24, errPct, roas, stopped };
  }, [last24, latest, cfg]);

  // Kill-switch risk assessment: classify each switch as tripped / at_risk / ok / unknown.
  const risk = useMemo(() => {
    const errPct = latest?.error_pct;
    const errSample = latest?.error_sample ?? 0;
    const roas = latest?.trailing_roas == null ? null : Number(latest.trailing_roas);
    const spend = (latest?.trailing_spend_cents ?? 0) / 100;

    // Error-rate switch
    let errStatus: "ok" | "at_risk" | "tripped" | "unknown" = "unknown";
    if (errPct != null && errSample >= cfg.minActions) {
      if (errPct >= cfg.maxErrorPct) errStatus = "tripped";
      else if (errPct >= cfg.maxErrorPct * 0.75) errStatus = "at_risk";
      else errStatus = "ok";
    } else if (errPct != null) {
      errStatus = "ok"; // sample too small to trip
    }

    // ROAS switch (needs $100 trailing spend)
    let roasStatus: "ok" | "at_risk" | "tripped" | "unknown" = "unknown";
    if (roas != null && spend >= 100) {
      if (roas < cfg.minRoas) roasStatus = "tripped";
      else if (roas < cfg.minRoas * 1.15) roasStatus = "at_risk";
      else roasStatus = "ok";
    } else if (roas != null) {
      roasStatus = "ok";
    }
    return { errStatus, roasStatus, errPct, roas, spend, errSample };
  }, [latest, cfg]);

  const riskBadge = (s: "ok" | "at_risk" | "tripped" | "unknown") => {
    if (s === "tripped") return <Badge variant="destructive" className="text-[10px]">TRIPPED</Badge>;
    if (s === "at_risk") return <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500/90 text-white">AT RISK</Badge>;
    if (s === "ok") return <Badge variant="default" className="text-[10px]">OK</Badge>;
    return <Badge variant="secondary" className="text-[10px]">NO DATA</Badge>;
  };

  async function setSetting(key: string, value: any) {
    const { error } = await supabase.from("app_settings" as any)
      .upsert({ key, value }, { onConflict: "key" });
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["instacart-autopilot-settings-ext"] });
  }

  async function acknowledgeAndReenable() {
    setAcknowledging(true);
    try {
      // Clear the auto-stop markers + flip enabled back on.
      await supabase.from("app_settings" as any).upsert([
        { key: "instacart_autopilot_enabled", value: true },
        { key: "instacart_autopilot_auto_stopped_at", value: null },
        { key: "instacart_autopilot_auto_stopped_reason", value: null },
        { key: "instacart_autopilot_last_reenabled_at", value: new Date().toISOString() },
      ], { onConflict: "key" });
      toast.success("Autopilot re-enabled");
      qc.invalidateQueries({ queryKey: ["instacart-autopilot-settings-ext"] });
      qc.invalidateQueries({ queryKey: ["instacart-autopilot-settings"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Re-enable failed");
    } finally { setAcknowledging(false); }
  }

  async function snooze24h() {
    // Mark acknowledged but leave disabled; cron will skip until manually re-enabled.
    await supabase.from("app_settings" as any).upsert([
      { key: "instacart_autopilot_acknowledged_at", value: new Date().toISOString() },
      { key: "instacart_autopilot_snoozed_until", value: new Date(Date.now() + 86400_000).toISOString() },
    ], { onConflict: "key" });
    toast.success("Auto-stop acknowledged · snoozed 24h");
    qc.invalidateQueries({ queryKey: ["instacart-autopilot-settings-ext"] });
  }

  const stopReason = cfg.stoppedReason
    ? (typeof cfg.stoppedReason === "string" ? cfg.stoppedReason : (cfg.stoppedReason.reason ?? "unknown"))
    : null;

  return (
    <div className="space-y-4">
      {/* Auto-stop banner */}
      {cfg.stoppedAt && !cfg.enabled && (
        <Card className="border-2 border-destructive bg-destructive/5">
          <CardContent className="p-4 flex flex-wrap items-start gap-3 justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Autopilot auto-stopped</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Reason: <span className="font-mono">{stopReason}</span> ·{" "}
                  Stopped {new Date(cfg.stoppedAt).toLocaleString()}
                </p>
                {cfg.stoppedReason && typeof cfg.stoppedReason === "object" && (
                  <pre className="text-[10px] bg-background/50 mt-2 p-2 rounded max-w-xl overflow-x-auto">
                    {JSON.stringify(cfg.stoppedReason, null, 2)}
                  </pre>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={snooze24h}>
                <Bell className="h-3 w-3 mr-1" /> Acknowledge · snooze 24h
              </Button>
              <Button size="sm" onClick={acknowledgeAndReenable} disabled={acknowledging}>
                <Play className="h-3 w-3 mr-1" /> Acknowledge & Re-enable
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metric tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard
          label="Autopilot status"
          value={tiles.stopped ? "STOPPED" : cfg.enabled ? "ACTIVE" : "MANUAL"}
        />
        <MetricCard label="Executed (24h)" value={String(tiles.executed24)} />
        <MetricCard label="B2B actions (24h)" value={String(tiles.b2b24)} />
        <MetricCard
          label="Last error rate"
          value={tiles.errPct == null ? "—" : `${tiles.errPct.toFixed(1)}%`}
        />
        <MetricCard
          label="Trailing ROAS"
          value={tiles.roas == null ? "—" : `${Number(tiles.roas).toFixed(2)}x`}
        />
      </div>

      {/* Kill switch risk tiles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-brand flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Kill Switch Risk
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Live comparison of the latest evaluation against configured auto-stop thresholds.
            "At risk" = within 15–25% of tripping.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-border p-4 bg-card" style={{ borderRadius: 0 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-brand text-muted-foreground font-semibold">
                Error-rate switch
              </div>
              {riskBadge(risk.errStatus)}
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {risk.errPct == null ? "—" : `${risk.errPct.toFixed(1)}%`}
              <span className="text-xs text-muted-foreground font-normal ml-2">
                / {cfg.maxErrorPct}% max
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Window: last {cfg.errorWindow} runs · sample {risk.errSample}/{cfg.minActions} min
            </div>
          </div>

          <div className="border border-border p-4 bg-card" style={{ borderRadius: 0 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-brand text-muted-foreground font-semibold">
                ROAS switch
              </div>
              {riskBadge(risk.roasStatus)}
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {risk.roas == null ? "—" : `${risk.roas.toFixed(2)}x`}
              <span className="text-xs text-muted-foreground font-normal ml-2">
                / {cfg.minRoas.toFixed(2)}x min
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Window: trailing {cfg.roasWindowDays}d · spend ${risk.spend.toFixed(0)} (need $100+)
            </div>
          </div>

          <div className="border border-border p-4 bg-card" style={{ borderRadius: 0 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-brand text-muted-foreground font-semibold">
                Overall posture
              </div>
              {tiles.stopped
                ? <Badge variant="destructive" className="text-[10px]">AUTO-STOPPED</Badge>
                : risk.errStatus === "tripped" || risk.roasStatus === "tripped"
                  ? <Badge variant="destructive" className="text-[10px]">WILL STOP</Badge>
                  : risk.errStatus === "at_risk" || risk.roasStatus === "at_risk"
                    ? <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500/90 text-white">AT RISK</Badge>
                    : <Badge variant="default" className="text-[10px]">HEALTHY</Badge>}
            </div>
            <div className="text-2xl font-bold">
              {tiles.stopped ? "Stopped" :
                risk.errStatus === "tripped" || risk.roasStatus === "tripped" ? "Will trip" :
                risk.errStatus === "at_risk" || risk.roasStatus === "at_risk" ? "Watch" : "Clear"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {latest ? `Last eval ${new Date(latest.ran_at).toLocaleTimeString()}` : "No evaluations yet"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* B2B controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-brand flex items-center gap-2">
            <Briefcase className="h-4 w-4" /> B2B Autopilot Controls
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Tighter guardrails for wholesale / on-premise campaigns (campaigns flagged <code>metadata.b2b=true</code> or whose objective contains "b2b" / "wholesale").
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">B2B mode</label>
            <Select value={cfg.b2bMode} onValueChange={(v) => setSetting("instacart_autopilot_b2b_mode", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="include">Include — act on B2B + consumer</SelectItem>
                <SelectItem value="exclude">Exclude — never touch B2B</SelectItem>
                <SelectItem value="only">B2B only — skip consumer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">B2B max bid change ±%</label>
            <Input type="number" min={1} max={100} value={cfg.b2bMaxBidPct}
              onChange={(e) => setSetting("instacart_autopilot_b2b_max_bid_change_pct", Number(e.target.value))}
              className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">B2B daily action cap</label>
            <Input type="number" min={0} max={100} value={cfg.b2bDailyCap}
              onChange={(e) => setSetting("instacart_autopilot_b2b_daily_cap", Number(e.target.value))}
              className="h-8 text-xs" />
          </div>
        </CardContent>
      </Card>

      {/* Evaluation log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-brand flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Autopilot Evaluation Log
            <Badge variant="outline" className="text-[10px] ml-1">{evals.length} runs</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Each run captures error rate, trailing ROAS, candidates evaluated, executions, and auto-stop verdict.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {evals.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4">No evaluations yet — they appear after the next autopilot run.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr className="text-left">
                  <th className="p-2">Ran</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Err %</th>
                  <th className="p-2">ROAS</th>
                  <th className="p-2 text-right">Spend</th>
                  <th className="p-2 text-right">Candidates</th>
                  <th className="p-2 text-right">Eligible</th>
                  <th className="p-2 text-right">Executed</th>
                  <th className="p-2 text-right">B2B</th>
                  <th className="p-2">Stop reason</th>
                </tr>
              </thead>
              <tbody>
                {evals.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">{new Date(e.ran_at).toLocaleString()}</td>
                    <td className="p-2">
                      {e.auto_stopped ? (
                        <Badge variant="destructive" className="text-[10px]">AUTO-STOPPED</Badge>
                      ) : e.enabled_after ? (
                        <Badge variant="default" className="text-[10px]">RAN</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">DISABLED</Badge>
                      )}
                    </td>
                    <td className="p-2 tabular-nums">{e.error_pct == null ? "—" : `${e.error_pct.toFixed(1)}%`}</td>
                    <td className="p-2 tabular-nums">{e.trailing_roas == null ? "—" : `${Number(e.trailing_roas).toFixed(2)}x`}</td>
                    <td className="p-2 text-right tabular-nums">{dollars(e.trailing_spend_cents)}</td>
                    <td className="p-2 text-right tabular-nums">{e.candidates_considered ?? 0}</td>
                    <td className="p-2 text-right tabular-nums">{e.eligible ?? 0}</td>
                    <td className="p-2 text-right tabular-nums">{e.executed ?? 0}</td>
                    <td className="p-2 text-right tabular-nums">
                      {e.b2b_eligible ?? 0}{" "}
                      {e.b2b_mode && <span className="text-muted-foreground">({e.b2b_mode})</span>}
                    </td>
                    <td className="p-2 text-muted-foreground font-mono">
                      {e.auto_stop_reason ?? "—"}
                      {e.notification_sent && (
                        <Bell className="h-3 w-3 inline ml-1 text-primary" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}