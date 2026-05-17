import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertTriangle, Activity, Users, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const SHARP = { borderRadius: 0 } as const;

type Props = { platform: "meta" | "google" | "instacart"; channelId?: string | null };

type Forecast = {
  id: string; metric: string; horizon_days: number; scope_label: string | null;
  forecast_value: number; lower_bound: number | null; upper_bound: number | null;
  narrative: string | null; generated_at: string;
};
type Anomaly = {
  id: string; scope_label: string | null; metric: string; observed: number; expected: number;
  z_score: number | null; pct_change: number | null; severity: string; kind: string;
  narrative: string | null; suggested_action: string | null; detected_at: string;
};
type Saturation = {
  id: string; scope_label: string | null; current_daily_spend: number | null;
  current_roas: number | null; efficient_spend_ceiling: number | null;
  recommendation: string | null; reallocation_delta: number | null; generated_at: string;
};

export default function IntelligencePanel({ platform, channelId }: Props) {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [saturations, setSaturations] = useState<Saturation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    const [f, a, s] = await Promise.all([
      supabase.from("ad_forecasts").select("*").eq("platform", platform).order("generated_at", { ascending: false }).limit(10),
      supabase.from("ad_anomalies").select("*").eq("platform", platform).is("resolved_at", null).order("detected_at", { ascending: false }).limit(20),
      supabase.from("ad_saturation_curves").select("*").eq("platform", platform).order("generated_at", { ascending: false }).limit(10),
    ]);
    setForecasts((f.data as any) ?? []);
    setAnomalies((a.data as any) ?? []);
    setSaturations((s.data as any) ?? []);
  };

  useEffect(() => { refresh(); }, [platform]);

  const run = async (action: string, label: string, payload: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const { error } = await supabase.functions.invoke("ad-intelligence", {
        body: { action, platform, channel_id: channelId, ...payload },
      });
      if (error) throw error;
      toast.success(`${label} complete`);
      await refresh();
    } catch (e: any) {
      toast.error(`${label} failed`, { description: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  };

  const sevColor = (sev: string) =>
    sev === "critical" ? "bg-destructive text-destructive-foreground" :
    sev === "warn" ? "bg-amber-500 text-white" : "bg-muted text-foreground";

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold uppercase tracking-brand flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Intelligence
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" style={SHARP} disabled={!!busy} onClick={() => run("forecast", "Revenue forecast", { scope_type: "channel", metric: "revenue", horizon_days: 30 })}>
            <TrendingUp className="h-3 w-3 mr-1" /> Forecast 30d
          </Button>
          <Button size="sm" variant="outline" style={SHARP} disabled={!!busy} onClick={() => run("detect_anomalies", "Anomaly scan")}>
            <AlertTriangle className="h-3 w-3 mr-1" /> Scan anomalies
          </Button>
          <Button size="sm" variant="outline" style={SHARP} disabled={!!busy} onClick={() => run("score_propensity", "Propensity scoring", { score_type: "convert" })}>
            <Users className="h-3 w-3 mr-1" /> Score audiences
          </Button>
          <Button size="sm" variant="outline" style={SHARP} onClick={refresh}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Forecasts */}
        <div className="border border-border bg-card" style={SHARP}>
          <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-brand text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-3 w-3" /> Forecasts
          </div>
          {forecasts.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No forecasts yet. Click "Forecast 30d" to generate.</div>
          ) : forecasts.map((f) => (
            <div key={f.id} className="px-3 py-2 border-b border-border last:border-0 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-bold uppercase tracking-brand text-xs">
                  {f.scope_label ?? "Channel"} · {f.metric} · {f.horizon_days}d
                </div>
                <div className="font-bold">${Number(f.forecast_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              {f.lower_bound !== null && f.upper_bound !== null && (
                <div className="text-[11px] text-muted-foreground">
                  95% CI: ${Number(f.lower_bound).toFixed(0)} – ${Number(f.upper_bound).toFixed(0)}
                </div>
              )}
              {f.narrative && <div className="text-xs text-muted-foreground mt-1">{f.narrative}</div>}
            </div>
          ))}
        </div>

        {/* Anomalies */}
        <div className="border border-border bg-card" style={SHARP}>
          <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-brand text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-3 w-3" /> Open anomalies
          </div>
          {anomalies.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No open anomalies. Run a scan to check.</div>
          ) : anomalies.map((a) => (
            <div key={a.id} className="px-3 py-2 border-b border-border last:border-0 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-xs truncate">{a.scope_label ?? "—"}</div>
                <Badge style={SHARP} className={sevColor(a.severity) + " text-[10px] uppercase"}>{a.severity}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {a.metric}: {Number(a.observed).toFixed(2)} vs avg {Number(a.expected).toFixed(2)}
                {a.pct_change !== null && ` (${Number(a.pct_change).toFixed(0)}%)`}
              </div>
              {a.narrative && <div className="text-xs mt-1">{a.narrative}</div>}
              {a.suggested_action && <div className="text-[11px] text-muted-foreground mt-1 italic">→ {a.suggested_action}</div>}
            </div>
          ))}
        </div>

        {/* Saturation */}
        <div className="border border-border bg-card md:col-span-2" style={SHARP}>
          <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-brand text-muted-foreground flex items-center gap-2">
            <Activity className="h-3 w-3" /> Saturation & re-allocation
          </div>
          {saturations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No saturation curves yet. Drill into a campaign and run a saturation fit from the optimizer.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-brand text-muted-foreground border-b border-border">
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2">Current spend/day</th>
                  <th className="px-3 py-2">Current ROAS</th>
                  <th className="px-3 py-2">Efficient ceiling</th>
                  <th className="px-3 py-2">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {saturations.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-bold text-xs">{s.scope_label ?? "—"}</td>
                    <td className="px-3 py-2">${Number(s.current_daily_spend ?? 0).toFixed(0)}</td>
                    <td className="px-3 py-2">{Number(s.current_roas ?? 0).toFixed(2)}x</td>
                    <td className="px-3 py-2">{s.efficient_spend_ceiling ? `$${Number(s.efficient_spend_ceiling).toFixed(0)}` : "—"}</td>
                    <td className="px-3 py-2 text-xs">{s.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}