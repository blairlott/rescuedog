import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

/**
 * Meta Autopilot — Health, kill-switch log, and guarded re-enable.
 *
 * Mirrors the Instacart autopilot panel. Reads:
 *  - app_settings.meta_autopilot_* (enabled, thresholds, cooldown, auto-stop info)
 *  - ad_autopilot_evaluations (latest run)
 *  - ad_autopilot_kill_switch_evaluations (last 50 rows)
 *
 * Re-enable requires:
 *  1. Cooldown period (meta_autopilot_cooldown_minutes) has elapsed since
 *     meta_autopilot_auto_stopped_at.
 *  2. User types "RE-ENABLE META AUTOPILOT" exactly.
 *  3. User checks acknowledgement.
 */

type Setting = { key: string; value: any };

const RE_ENABLE_PHRASE = "RE-ENABLE META AUTOPILOT";

function num(n: any, d = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(d);
}
function pct(n: any) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(1)}%`;
}
function dollars(c: any) {
  if (c == null || !Number.isFinite(Number(c))) return "—";
  return `$${(Number(c) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function MetaAutopilotHealth() {
  const qc = useQueryClient();
  const [phrase, setPhrase] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const settingsQ = useQuery({
    queryKey: ["meta-autopilot-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings" as any)
        .select("key,value")
        .like("key", "meta_autopilot%");
      if (error) throw error;
      const map: Record<string, any> = {};
      ((data ?? []) as unknown as Setting[]).forEach((r) => { map[r.key] = r.value; });
      return map;
    },
    refetchInterval: 30_000,
  });

  const evalQ = useQuery({
    queryKey: ["meta-autopilot-evaluations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ad_autopilot_evaluations" as any)
        .select("*").eq("platform", "meta")
        .order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
    refetchInterval: 30_000,
  });

  const switchQ = useQuery({
    queryKey: ["meta-autopilot-killswitch-log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ad_autopilot_kill_switch_evaluations" as any)
        .select("*").eq("platform", "meta")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  // EMQ (Event Match Quality) — share of live successful Purchase events in the
  // last 7 days that carry each identifier. Higher coverage = better attribution
  // for ASC/Advantage+. fbp/fbc require the browser Pixel to be loaded.
  const emqQ = useQuery({
    queryKey: ["meta-autopilot-emq"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("meta_capi_events" as any)
        .select("email_hash,fbp,fbc")
        .eq("success", true)
        .eq("test_mode", false)
        .gte("sent_at", since)
        .limit(2000);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const total = rows.length;
      const withEmail = rows.filter((r) => r.email_hash).length;
      const withFbp = rows.filter((r) => r.fbp).length;
      const withFbc = rows.filter((r) => r.fbc).length;
      // 0–10 score, weighted toward signals Meta values most for attribution.
      const score = total === 0 ? null :
        Math.round(((withEmail / total) * 4 + (withFbp / total) * 3 + (withFbc / total) * 3) * 10) / 10;
      return { total, withEmail, withFbp, withFbc, score };
    },
    refetchInterval: 60_000,
  });

  const cfg = settingsQ.data ?? {};
  const enabled = cfg.meta_autopilot_enabled === true;
  const cooldownMin = Number(cfg.meta_autopilot_cooldown_minutes ?? 60);
  const stoppedAt = cfg.meta_autopilot_auto_stopped_at ? new Date(String(cfg.meta_autopilot_auto_stopped_at)) : null;
  const stoppedReason = cfg.meta_autopilot_auto_stopped_reason ?? null;
  const latest = evalQ.data as any;
  const killLog = (switchQ.data ?? []) as any[];

  const cooldownEndsAt = useMemo(() => {
    if (!stoppedAt) return null;
    return new Date(stoppedAt.getTime() + cooldownMin * 60_000);
  }, [stoppedAt, cooldownMin]);
  const cooldownActive = cooldownEndsAt ? Date.now() < cooldownEndsAt.getTime() : false;
  const cooldownRemainingMs = cooldownEndsAt ? Math.max(0, cooldownEndsAt.getTime() - Date.now()) : 0;

  // Tile status derived from latest evaluation + auto-stop info.
  const tile = useMemo(() => {
    if (!enabled && stoppedAt) return { label: "AUTO-STOPPED", tone: "stop" as const };
    const tripped = (killLog ?? []).some((r) => r.tripped);
    if (tripped) return { label: "WILL STOP", tone: "danger" as const };
    const atRisk = (killLog ?? []).slice(0, 5).some((r) => r.status === "at_risk");
    if (atRisk) return { label: "AT RISK", tone: "warn" as const };
    if (!enabled) return { label: "DISABLED", tone: "muted" as const };
    return { label: "HEALTHY", tone: "ok" as const };
  }, [enabled, stoppedAt, killLog]);

  async function reEnable() {
    if (cooldownActive) {
      toast.error("Cooldown still active.");
      return;
    }
    if (!ack) {
      toast.error("Acknowledge that you've reviewed the auto-stop reason.");
      return;
    }
    if (cooldownActive) {
      toast.error(`Cooldown still active for ${Math.ceil(cooldownRemainingMs / 60_000)} more min.`);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("app_settings" as any).upsert([
        { key: "meta_autopilot_enabled", value: true },
        { key: "meta_autopilot_auto_stopped_at", value: null },
        { key: "meta_autopilot_auto_stopped_reason", value: null },
      ], { onConflict: "key" });
      if (error) throw error;
      toast.success("Meta autopilot re-enabled.");
      setPhrase(""); setAck(false);
      qc.invalidateQueries({ queryKey: ["meta-autopilot-settings"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Re-enable failed");
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    try {
      const { error } = await supabase.from("app_settings" as any)
        .upsert([{ key: "meta_autopilot_enabled", value: false }], { onConflict: "key" });
      if (error) throw error;
      toast.success("Meta autopilot disabled.");
      qc.invalidateQueries({ queryKey: ["meta-autopilot-settings"] });
    } catch (e: any) { toast.error(e?.message ?? "Disable failed"); }
    finally { setBusy(false); }
  }

  async function runNow() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-autopilot", { body: {} });
      if (error) throw error;
      toast.success(`Meta autopilot run: ${JSON.stringify(data).slice(0, 100)}`);
      qc.invalidateQueries({ queryKey: ["meta-autopilot-evaluations"] });
      qc.invalidateQueries({ queryKey: ["meta-autopilot-killswitch-log"] });
    } catch (e: any) { toast.error(e?.message ?? "Run failed"); }
    finally { setBusy(false); }
  }

  const tileBg =
    tile.tone === "ok" ? "bg-primary text-primary-foreground" :
    tile.tone === "warn" ? "bg-foreground/70 text-background" :
    tile.tone === "danger" ? "bg-primary text-primary-foreground" :
    tile.tone === "stop" ? "bg-foreground text-background" :
    "bg-muted text-foreground";

  return (
    <section className="border-2 border-foreground bg-background p-4 space-y-4" style={{ borderRadius: 0 }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm uppercase tracking-brand font-bold text-foreground flex items-center gap-2">
            {enabled ? <ShieldCheck className="h-4 w-4 text-primary" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
            Meta Purchase Autopilot
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-prose">
            Auto-stops on execution error rate or trailing Purchase ROAS below threshold.
            Pauses campaigns and adjusts daily budgets only — never edits creative or targeting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-3 py-2 text-xs uppercase tracking-brand font-bold ${tileBg}`} style={{ borderRadius: 0 }}>
            {tile.label}
          </div>
          <button
            onClick={runNow}
            disabled={busy}
            className="text-[11px] uppercase tracking-brand font-bold border-2 border-foreground px-3 py-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50"
            style={{ borderRadius: 0 }}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Run now"}
          </button>
          {enabled ? (
            <button
              onClick={disable}
              disabled={busy}
              className="text-[11px] uppercase tracking-brand font-bold border-2 border-foreground px-3 py-2 bg-foreground text-background hover:bg-primary disabled:opacity-50"
              style={{ borderRadius: 0 }}
            >
              Disable
            </button>
          ) : null}
        </div>
      </div>

      {/* Auto-stop card */}
      {!enabled && stoppedAt ? (
        <div className="border-2 border-primary p-3 bg-primary/5" style={{ borderRadius: 0 }}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="text-xs uppercase tracking-brand font-bold text-primary">Auto-stopped</div>
              <div className="text-xs text-foreground">
                <strong>Stopped at:</strong> {stoppedAt.toLocaleString()}<br />
                <strong>Reason:</strong> {(stoppedReason as any)?.reason ?? "unknown"}
              </div>
              {stoppedReason ? (
                <pre className="text-[10px] bg-background border border-foreground/20 p-2 overflow-x-auto" style={{ borderRadius: 0 }}>
                  {JSON.stringify(stoppedReason, null, 2)}
                </pre>
              ) : null}

              <div className="border-t border-foreground/20 pt-2">
                <div className="text-[11px] text-muted-foreground mb-2">
                  {cooldownActive
                    ? <>Cooldown active: <strong>{Math.ceil(cooldownRemainingMs / 60_000)} min</strong> remaining. Re-enable available at {cooldownEndsAt?.toLocaleTimeString()}.</>
                    : <>Cooldown elapsed. Re-enable with one click.</>}
                </div>
                <button
                  onClick={reEnable}
                  disabled={cooldownActive || busy}
                  className="mt-2 text-[11px] uppercase tracking-brand font-bold border-2 border-primary bg-primary text-primary-foreground px-3 py-2 hover:bg-primary/90 disabled:opacity-40"
                  style={{ borderRadius: 0 }}
                >
                  Re-enable autopilot
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Latest run tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Latest error rate" value={pct(latest?.error_pct)} sub={latest?.error_sample ? `${latest.error_sample} actions` : "—"} />
        <Stat label="Trailing ROAS" value={`${num(latest?.trailing_roas, 2)}x`} sub={`min ${num(cfg.meta_autopilot_min_roas, 2)}x`} />
        <Stat label="Trailing spend" value={dollars(latest?.trailing_spend_cents)} sub={`window ${cfg.meta_autopilot_roas_window_days ?? 7}d`} />
        <Stat label="Daily cap" value={`${latest?.executed ?? 0}/${cfg.meta_autopilot_daily_action_cap ?? 10}`} sub="executed today" />
      </div>

      {/* EMQ — Event Match Quality */}
      <div>
        <div className="text-[11px] uppercase tracking-brand font-bold text-foreground mb-2 flex items-center justify-between">
          <span>Event match quality (last 7d Purchase events)</span>
          {emqQ.data ? (
            <span className="text-muted-foreground normal-case tracking-normal">
              n={emqQ.data.total} {emqQ.data.score != null ? `· score ${emqQ.data.score}/10` : ""}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Match score"
            value={emqQ.data?.score != null ? `${emqQ.data.score}/10` : "—"}
            sub={
              emqQ.data == null ? "loading" :
              emqQ.data.score == null ? "no events" :
              emqQ.data.score >= 8 ? "strong" :
              emqQ.data.score >= 6 ? "fair" : "weak — pixel missing?"
            }
          />
          <Stat
            label="Hashed email"
            value={emqQ.data && emqQ.data.total ? pct((emqQ.data.withEmail / emqQ.data.total) * 100) : "—"}
            sub={emqQ.data ? `${emqQ.data.withEmail}/${emqQ.data.total}` : "—"}
          />
          <Stat
            label="_fbp cookie"
            value={emqQ.data && emqQ.data.total ? pct((emqQ.data.withFbp / emqQ.data.total) * 100) : "—"}
            sub={emqQ.data ? `${emqQ.data.withFbp}/${emqQ.data.total}` : "—"}
          />
          <Stat
            label="_fbc click ID"
            value={emqQ.data && emqQ.data.total ? pct((emqQ.data.withFbc / emqQ.data.total) * 100) : "—"}
            sub={emqQ.data ? `${emqQ.data.withFbc}/${emqQ.data.total}` : "—"}
          />
        </div>
        {emqQ.data && emqQ.data.total > 0 && (emqQ.data.withFbp / emqQ.data.total < 0.4) ? (
          <div className="mt-2 border-2 border-foreground/30 p-2 text-[11px] text-muted-foreground" style={{ borderRadius: 0 }}>
            <strong className="text-foreground">Low _fbp coverage.</strong> Browser Meta Pixel may not be firing on the
            checkout origin. Without _fbp/_fbc, attribution falls back to probabilistic matching and ASC learning slows.
          </div>
        ) : null}
      </div>

      {/* Kill-switch log */}
      <div>
        <div className="text-[11px] uppercase tracking-brand font-bold text-foreground mb-2">Kill-switch evaluations (last 50)</div>
        <div className="border-2 border-foreground overflow-x-auto" style={{ borderRadius: 0 }}>
          <table className="w-full text-[11px]">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="px-2 py-1 font-bold">When</th>
                <th className="px-2 py-1 font-bold">Switch</th>
                <th className="px-2 py-1 font-bold">Status</th>
                <th className="px-2 py-1 font-bold">Measured</th>
                <th className="px-2 py-1 font-bold">Threshold</th>
                <th className="px-2 py-1 font-bold">Sample / Spend</th>
              </tr>
            </thead>
            <tbody>
              {killLog.length === 0 ? (
                <tr><td colSpan={6} className="px-2 py-3 text-muted-foreground text-center">No evaluations yet — autopilot hasn't run.</td></tr>
              ) : killLog.map((r: any) => (
                <tr key={r.id} className="border-t border-foreground/10">
                  <td className="px-2 py-1 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-2 py-1">{r.switch_name}</td>
                  <td className="px-2 py-1">
                    <span className={
                      r.status === "tripped" ? "text-primary font-bold" :
                      r.status === "at_risk" ? "text-foreground/70 font-bold" :
                      r.status === "skipped" ? "text-muted-foreground" : "text-foreground"
                    }>
                      {r.status === "ok" ? <CheckCircle2 className="h-3 w-3 inline mr-1" /> : null}
                      {r.status}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    {r.switch_name === "error_rate" ? pct(r.measured_value) :
                     r.switch_name === "roas" ? `${num(r.measured_value, 2)}x` :
                     num(r.measured_value, 2)}
                  </td>
                  <td className="px-2 py-1">
                    {r.switch_name === "error_rate" ? pct(r.threshold) :
                     r.switch_name === "roas" ? `${num(r.threshold, 2)}x` :
                     num(r.threshold, 2)}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {r.sample_size != null ? `n=${r.sample_size}` :
                     r.spend_cents != null ? `spend ${dollars(r.spend_cents)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer font-bold uppercase tracking-brand text-foreground">Settings (read-only)</summary>
        <pre className="mt-2 p-2 bg-muted overflow-x-auto" style={{ borderRadius: 0 }}>
          {JSON.stringify(cfg, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-2 border-foreground p-3" style={{ borderRadius: 0 }}>
      <div className="text-[10px] uppercase tracking-brand text-muted-foreground font-bold">{label}</div>
      <div className="text-xl font-bold text-foreground mt-1">{value}</div>
      {sub ? <div className="text-[10px] text-muted-foreground mt-1">{sub}</div> : null}
    </div>
  );
}