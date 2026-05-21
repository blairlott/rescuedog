import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/kennel/MetricCard";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Briefcase, Play, Bell, CheckCircle2, Plus, Trash2, ShieldAlert, Lock, Clock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
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
  const [reenableOpen, setReenableOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [confirmAck, setConfirmAck] = useState(false);

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
          "instacart_autopilot_reenable_cooldown_minutes",
          "instacart_autopilot_last_reenabled_at",
          "instacart_autopilot_reenable_history",
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
      cooldownMinutes: Number(m.instacart_autopilot_reenable_cooldown_minutes ?? 30),
      lastReenabledAt: (m.instacart_autopilot_last_reenabled_at ?? null) as string | null,
      reenableHistory: (m.instacart_autopilot_reenable_history ?? []) as Array<{
        at: string; reason: string | null; actor?: string | null; note?: string | null;
      }>,
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
      const nowIso = new Date().toISOString();
      const { data: au } = await supabase.auth.getUser();
      const actor = au?.user?.email ?? au?.user?.id ?? null;
      const entry = {
        at: nowIso,
        reason: stopReason,
        actor,
        stoppedAt: cfg.stoppedAt,
        detail: typeof cfg.stoppedReason === "object" ? cfg.stoppedReason : null,
      };
      const nextHistory = [entry, ...(cfg.reenableHistory ?? [])].slice(0, 20);
      // Clear the auto-stop markers + flip enabled back on + log history.
      await supabase.from("app_settings" as any).upsert([
        { key: "instacart_autopilot_enabled", value: true },
        { key: "instacart_autopilot_auto_stopped_at", value: null },
        { key: "instacart_autopilot_auto_stopped_reason", value: null },
        { key: "instacart_autopilot_last_reenabled_at", value: nowIso },
        { key: "instacart_autopilot_reenable_history", value: nextHistory },
        { key: "instacart_autopilot_snoozed_until", value: null },
      ], { onConflict: "key" });
      toast.success("Autopilot re-enabled");
      setReenableOpen(false);
      setConfirmText("");
      setConfirmAck(false);
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

  // Cooldown gating: prevent re-enable until N minutes after auto-stop.
  const cooldown = useMemo(() => {
    if (!cfg.stoppedAt || cfg.cooldownMinutes <= 0) {
      return { active: false, remainingMs: 0, readyAt: null as string | null };
    }
    const readyAt = new Date(new Date(cfg.stoppedAt).getTime() + cfg.cooldownMinutes * 60_000);
    const remainingMs = readyAt.getTime() - Date.now();
    return { active: remainingMs > 0, remainingMs: Math.max(0, remainingMs), readyAt: readyAt.toISOString() };
  }, [cfg.stoppedAt, cfg.cooldownMinutes]);

  const cooldownLabel = (() => {
    if (!cooldown.active) return null;
    const mins = Math.ceil(cooldown.remainingMs / 60_000);
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  })();

  const confirmPhrase = "RE-ENABLE";
  const canConfirm = confirmText.trim().toUpperCase() === confirmPhrase && confirmAck && !cooldown.active;

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
              <Button
                size="sm"
                onClick={() => setReenableOpen(true)}
                disabled={acknowledging}
              >
                {cooldown.active ? <Lock className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                {cooldown.active ? `Cooldown · ${cooldownLabel}` : "Acknowledge & Re-enable"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guarded re-enable dialog */}
      <AlertDialog open={reenableOpen} onOpenChange={(o) => {
        setReenableOpen(o);
        if (!o) { setConfirmText(""); setConfirmAck(false); }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Re-enable Instacart autopilot
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Autopilot was auto-stopped
                  {cfg.stoppedAt ? ` ${new Date(cfg.stoppedAt).toLocaleString()}` : ""}
                  {stopReason ? <> for <span className="font-mono">{stopReason}</span></> : null}.
                  Re-enabling resumes automated bid and budget actions immediately.
                </p>
                {cooldown.active && (
                  <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-900 dark:text-amber-100">
                    <Clock className="h-4 w-4 mt-0.5" />
                    <div>
                      <p className="font-medium">Cooldown active</p>
                      <p className="text-xs">
                        Re-enable will be available in <span className="font-mono">{cooldownLabel}</span>
                        {cooldown.readyAt ? <> (at {new Date(cooldown.readyAt).toLocaleTimeString()})</> : null}.
                        Override the cooldown by lowering <span className="font-mono">instacart_autopilot_reenable_cooldown_minutes</span>.
                      </p>
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">
                    Type <span className="font-mono">{confirmPhrase}</span> to confirm
                  </Label>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={confirmPhrase}
                    autoFocus
                  />
                </div>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmAck}
                    onChange={(e) => setConfirmAck(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I have reviewed the stop reason, error rate, and trailing ROAS, and accept responsibility for resuming automated actions.
                  </span>
                </label>
                {cfg.lastReenabledAt && (
                  <p className="text-[11px] text-muted-foreground">
                    Last re-enabled: {new Date(cfg.lastReenabledAt).toLocaleString()}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (canConfirm) acknowledgeAndReenable(); }}
              disabled={!canConfirm || acknowledging}
            >
              <Play className="h-3 w-3 mr-1" />
              {acknowledging ? "Re-enabling…" : "Re-enable autopilot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* B2B Auto-Stop Settings */}
      <B2BAutoStopSettings
        cfg={{
          b2bAutoStop: cfg.b2bAutoStop,
          b2bMaxErrorPct: cfg.b2bMaxErrorPct,
          b2bMinRoas: cfg.b2bMinRoas,
          b2bAccountOverrides: cfg.b2bAccountOverrides,
          globalMaxErrorPct: cfg.maxErrorPct,
          globalMinRoas: cfg.minRoas,
        }}
        setSetting={setSetting}
      />

      {/* Re-enable guardrails */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-brand flex items-center gap-2">
            <Lock className="h-4 w-4" /> Re-enable Guardrails
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            After an auto-stop, the re-enable button requires typing <span className="font-mono">RE-ENABLE</span> and acknowledging review.
            Set a cooldown to enforce a waiting period before re-enable is permitted.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Cooldown (minutes after auto-stop)
              </label>
              <Input
                type="number" min={0} max={1440} value={cfg.cooldownMinutes}
                onChange={(e) => setSetting("instacart_autopilot_reenable_cooldown_minutes", Math.max(0, Number(e.target.value)))}
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">0 disables the cooldown.</p>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Last re-enabled</label>
              <p className="text-xs h-8 flex items-center">
                {cfg.lastReenabledAt ? new Date(cfg.lastReenabledAt).toLocaleString() : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Cooldown status</label>
              <div className="h-8 flex items-center">
                {cooldown.active
                  ? <Badge className="bg-amber-500 hover:bg-amber-500/90 text-white text-[10px]">WAITING · {cooldownLabel}</Badge>
                  : cfg.stoppedAt
                    ? <Badge variant="default" className="text-[10px]">READY</Badge>
                    : <Badge variant="secondary" className="text-[10px]">N/A</Badge>}
              </div>
            </div>
          </div>

          {cfg.reenableHistory && cfg.reenableHistory.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recent re-enables</p>
              <div className="border border-border rounded overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr className="text-left">
                      <th className="p-2">Re-enabled at</th>
                      <th className="p-2">Prior stop reason</th>
                      <th className="p-2">Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cfg.reenableHistory.slice(0, 10).map((h, i) => (
                      <tr key={`${h.at}-${i}`} className="border-t border-border">
                        <td className="p-2 whitespace-nowrap">{new Date(h.at).toLocaleString()}</td>
                        <td className="p-2 font-mono text-muted-foreground">{h.reason ?? "—"}</td>
                        <td className="p-2 text-muted-foreground">{h.actor ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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

// ---------- B2B Auto-Stop Settings subcomponent ----------

type OverrideRow = {
  accountId: string;
  label: string;
  autoStop: boolean;
  maxErrorPct: number;
  minRoas: number;
  cooldownMinutes: number;
};

function B2BAutoStopSettings({
  cfg,
  setSetting,
}: {
  cfg: {
    b2bAutoStop: boolean;
    b2bMaxErrorPct: number;
    b2bMinRoas: number;
    b2bAccountOverrides: Record<string, { label?: string; autoStop?: boolean; maxErrorPct?: number; minRoas?: number; cooldownMinutes?: number }>;
    globalMaxErrorPct: number;
    globalMinRoas: number;
  };
  setSetting: (key: string, value: any) => Promise<void>;
}) {
  const rows: OverrideRow[] = useMemo(() => {
    return Object.entries(cfg.b2bAccountOverrides ?? {}).map(([accountId, v]) => ({
      accountId,
      label: v.label ?? "",
      autoStop: v.autoStop !== false,
      maxErrorPct: Number(v.maxErrorPct ?? cfg.b2bMaxErrorPct),
      minRoas: Number(v.minRoas ?? cfg.b2bMinRoas),
      cooldownMinutes: Number(v.cooldownMinutes ?? 60),
    }));
  }, [cfg.b2bAccountOverrides, cfg.b2bMaxErrorPct, cfg.b2bMinRoas]);

  const [draftId, setDraftId] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Suggested accounts pulled from ad_campaigns metadata for B2B campaigns.
  const { data: suggestions = [] } = useQuery({
    queryKey: ["instacart-b2b-account-suggestions"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_campaigns")
        .select("external_id,name,metadata,objective")
        .eq("platform_slug", "instacart")
        .limit(500);
      const seen = new Map<string, string>();
      for (const row of (data ?? []) as any[]) {
        const md = (row.metadata ?? {}) as Record<string, any>;
        const isB2B = md.b2b === true
          || /b2b|wholesale|on[-_ ]?premise|off[-_ ]?premise/i.test(String(row.objective ?? ""))
          || String(md.segment ?? "").toLowerCase() === "b2b";
        if (!isB2B) continue;
        const aid = String(md.account_id ?? md.advertiser_id ?? md.advertiser_account_id ?? row.external_id ?? "").trim();
        if (!aid) continue;
        if (!seen.has(aid)) seen.set(aid, String(md.account_label ?? md.advertiser_name ?? row.name ?? aid));
      }
      return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
    },
    staleTime: 60_000,
  });

  // Per-account stop history from kill-switch evaluations.
  const { data: stopHistory = [] } = useQuery({
    queryKey: ["instacart-b2b-stop-history"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_autopilot_kill_switch_evaluations" as any)
        .select("id,created_at,switch_name,status,measured_value,threshold,tripped,detail")
        .eq("platform", "instacart")
        .order("created_at", { ascending: false })
        .limit(500);
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
  });
  const historyByAccount = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const ev of stopHistory) {
      const aid = String((ev?.detail ?? {})?.account_id ?? "").trim();
      if (!aid) continue;
      if (!map.has(aid)) map.set(aid, []);
      map.get(aid)!.push(ev);
    }
    return map;
  }, [stopHistory]);

  async function persistOverrides(next: OverrideRow[]) {
    const map: Record<string, any> = {};
    for (const r of next) {
      if (!r.accountId.trim()) continue;
      map[r.accountId.trim()] = {
        label: r.label || undefined,
        autoStop: r.autoStop,
        maxErrorPct: r.maxErrorPct,
        minRoas: r.minRoas,
        cooldownMinutes: r.cooldownMinutes,
      };
    }
    await setSetting("instacart_autopilot_b2b_account_overrides", map);
  }

  async function updateRow(idx: number, patch: Partial<OverrideRow>) {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    await persistOverrides(next);
  }

  async function removeRow(idx: number) {
    const next = rows.filter((_, i) => i !== idx);
    await persistOverrides(next);
  }

  async function addRow() {
    if (!draftId.trim()) { toast.error("Account ID required"); return; }
    if (rows.some(r => r.accountId === draftId.trim())) {
      toast.error("Account already configured"); return;
    }
    const suggested = suggestions.find(s => s.id === draftId.trim());
    const next: OverrideRow[] = [
      ...rows,
      {
        accountId: draftId.trim(),
        label: draftLabel.trim() || suggested?.label || "",
        autoStop: true,
        maxErrorPct: cfg.b2bMaxErrorPct,
        minRoas: cfg.b2bMinRoas,
        cooldownMinutes: 60,
      },
    ];
    await persistOverrides(next);
    setDraftId(""); setDraftLabel("");
    toast.success("Account override added");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-brand flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> B2B Auto-Stop Settings
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Configure error-rate and ROAS thresholds for B2B campaigns. Per-account overrides
          let you set tighter (or looser) auto-stop rules for individual advertiser accounts.
          When B2B auto-stop trips, only B2B execution is paused — consumer autopilot keeps running.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Defaults */}
        <div className="border border-border p-3 bg-muted/30" style={{ borderRadius: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-brand">B2B segment defaults</div>
              <p className="text-[11px] text-muted-foreground">
                Applied to all B2B campaigns without a per-account override. Tighter than the global thresholds
                ({cfg.globalMaxErrorPct}% err / {cfg.globalMinRoas.toFixed(2)}x ROAS).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Auto-stop B2B</span>
              <Switch
                checked={cfg.b2bAutoStop}
                onCheckedChange={(v) => setSetting("instacart_autopilot_b2b_auto_stop_enabled", v)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">B2B max error rate (%)</label>
              <Input
                type="number" min={1} max={100} step={0.5}
                value={cfg.b2bMaxErrorPct}
                onChange={(e) => setSetting("instacart_autopilot_b2b_max_error_rate_pct", Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">B2B min trailing ROAS (x)</label>
              <Input
                type="number" min={0} step={0.1}
                value={cfg.b2bMinRoas}
                onChange={(e) => setSetting("instacart_autopilot_b2b_min_roas", Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Per-account overrides */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-brand">Per-account overrides</div>
              <p className="text-[11px] text-muted-foreground">
                Override defaults for specific Instacart advertiser accounts.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">{rows.length} account{rows.length === 1 ? "" : "s"}</Badge>
          </div>

          {rows.length > 0 && (
            <div className="border border-border overflow-x-auto" style={{ borderRadius: 0 }}>
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-2">Account ID</th>
                    <th className="p-2">Label</th>
                    <th className="p-2">Auto-stop</th>
                    <th className="p-2">Max err %</th>
                    <th className="p-2">Min ROAS</th>
                    <th className="p-2">Cooldown (min)</th>
                    <th className="p-2">Stop history</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                   {rows.map((r, idx) => (
                    <Fragment key={r.accountId}>
                    <tr className="border-t border-border">
                      <td className="p-2 font-mono">{r.accountId}</td>
                      <td className="p-2">
                        <Input
                          value={r.label}
                          onChange={(e) => updateRow(idx, { label: e.target.value })}
                          placeholder="e.g. Whole Foods B2B"
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <Switch
                          checked={r.autoStop}
                          onCheckedChange={(v) => updateRow(idx, { autoStop: v })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number" min={1} max={100} step={0.5}
                          value={r.maxErrorPct}
                          onChange={(e) => updateRow(idx, { maxErrorPct: Number(e.target.value) })}
                          className="h-7 text-xs w-20"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number" min={0} step={0.1}
                          value={r.minRoas}
                          onChange={(e) => updateRow(idx, { minRoas: Number(e.target.value) })}
                          className="h-7 text-xs w-20"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number" min={0} max={1440} step={5}
                          value={r.cooldownMinutes}
                          onChange={(e) => updateRow(idx, { cooldownMinutes: Math.max(0, Number(e.target.value)) })}
                          className="h-7 text-xs w-20"
                        />
                      </td>
                      <td className="p-2">
                        {(() => {
                          const hist = historyByAccount.get(r.accountId) ?? [];
                          const trips = hist.filter(h => h.tripped).length;
                          return (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 text-[11px] px-2"
                              onClick={() => setExpanded(expanded === r.accountId ? null : r.accountId)}
                            >
                              {trips > 0
                                ? <Badge variant="destructive" className="text-[10px] mr-1">{trips}</Badge>
                                : <Badge variant="secondary" className="text-[10px] mr-1">{hist.length}</Badge>}
                              {expanded === r.accountId ? "Hide" : "View"}
                            </Button>
                          );
                        })()}
                      </td>
                      <td className="p-2">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => removeRow(idx)}
                          aria-label="Remove override"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                    {expanded === r.accountId && (
                      <tr className="bg-muted/30 border-t border-border">
                        <td colSpan={8} className="p-2">
                          {(() => {
                            const hist = historyByAccount.get(r.accountId) ?? [];
                            if (hist.length === 0) {
                              return <p className="text-[11px] text-muted-foreground">No kill-switch evaluations logged for this account yet.</p>;
                            }
                            return (
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-left text-muted-foreground">
                                    <th className="p-1">When</th>
                                    <th className="p-1">Switch</th>
                                    <th className="p-1">Status</th>
                                    <th className="p-1 text-right">Measured</th>
                                    <th className="p-1 text-right">Threshold</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {hist.slice(0, 15).map(h => (
                                    <tr key={h.id} className="border-t border-border">
                                      <td className="p-1 whitespace-nowrap">{new Date(h.created_at).toLocaleString()}</td>
                                      <td className="p-1 font-mono">{h.switch_name}</td>
                                      <td className="p-1">
                                        {h.tripped
                                          ? <Badge variant="destructive" className="text-[10px]">TRIPPED</Badge>
                                          : h.status === "at_risk"
                                            ? <Badge className="text-[10px] bg-amber-500 text-white">AT RISK</Badge>
                                            : <Badge variant="secondary" className="text-[10px]">{String(h.status).toUpperCase()}</Badge>}
                                      </td>
                                      <td className="p-1 text-right tabular-nums">{h.measured_value ?? "—"}</td>
                                      <td className="p-1 text-right tabular-nums">{h.threshold ?? "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2 mt-3">
            <div className="space-y-1 flex-1 min-w-[160px]">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Add account ID{suggestions.length > 0 ? ` (${suggestions.length} detected)` : ""}
              </label>
              <Input
                value={draftId}
                onChange={(e) => setDraftId(e.target.value)}
                placeholder="advertiser_12345"
                className="h-8 text-xs"
                list="b2b-account-suggestions"
              />
              <datalist id="b2b-account-suggestions">
                {suggestions.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </datalist>
            </div>
            <div className="space-y-1 flex-1 min-w-[160px]">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Label (optional)</label>
              <Input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="e.g. Sysco B2B"
                className="h-8 text-xs"
              />
            </div>
            <Button size="sm" onClick={addRow}>
              <Plus className="h-3 w-3 mr-1" /> Add override
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}