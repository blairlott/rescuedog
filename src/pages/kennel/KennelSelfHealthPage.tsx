import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, Activity } from "lucide-react";
import { Seo } from "@/components/Seo";

const SHARP = { borderRadius: 0 } as const;
const BRAND_FONT = { fontFamily: '"Nunito Sans", system-ui, sans-serif' } as const;

type Row = {
  id: string;
  checked_at: string;
  function_name: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
  consecutive_failures: number;
  alert_fired: boolean;
};

function relTime(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function KennelSelfHealthPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("kennel_self_health" as any)
      .select("*")
      .gte("checked_at", since)
      .order("checked_at", { ascending: false })
      .limit(1000);
    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows((data as unknown as Row[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Latest row per function
  const latest = useMemo(() => {
    const map = new Map<string, Row>();
    for (const r of rows) {
      if (!map.has(r.function_name)) map.set(r.function_name, r);
    }
    return Array.from(map.values()).sort((a, b) => a.function_name.localeCompare(b.function_name));
  }, [rows]);

  const summary = useMemo(() => {
    let ok = 0, fail = 0, alerts = 0;
    for (const r of latest) {
      if (r.ok) ok++; else fail++;
      if (r.alert_fired) alerts++;
    }
    return { ok, fail, alerts, total: latest.length };
  }, [latest]);

  const runNow = async () => {
    setRunning(true);
    const { error } = await supabase.functions.invoke("kennel-self-health", { body: {} });
    setRunning(false);
    if (error) toast.error(error.message);
    else { toast.success("Health check triggered"); setTimeout(load, 1500); }
  };

  return (
    <>
      <Seo noindex title="Kennel Self Health" />
    <div className="p-4 md:p-6 space-y-4" style={BRAND_FONT}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold uppercase tracking-brand text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5" /> Self-Health
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Kennel endpoint ping matrix — runs every 15 minutes. Alerts fire after 2 consecutive failures.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" style={SHARP} onClick={runNow} disabled={running} className="gap-2">
            <Activity className={`h-4 w-4 ${running ? "animate-pulse" : ""}`} /> Run now
          </Button>
          <Button variant="outline" size="sm" style={SHARP} onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label="Endpoints" value={summary.total} />
        <Tile label="Healthy" value={summary.ok} accent="text-green-600" />
        <Tile label="Failing" value={summary.fail} accent="text-destructive" />
        <Tile label="Alerts" value={summary.alerts} accent="text-amber-600" />
      </div>

      <div className="border border-border bg-card overflow-x-auto" style={SHARP}>
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left">
            <tr className="uppercase tracking-brand text-[10px] text-muted-foreground">
              <th className="px-2 py-2">Function</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2 text-right">Latency</th>
              <th className="px-2 py-2">Last check</th>
              <th className="px-2 py-2 text-right">Failures</th>
              <th className="px-2 py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && latest.length === 0 && (
              <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                No checks recorded yet. The 15-minute cron will populate this shortly, or click "Run now".
              </td></tr>
            )}
            {latest.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-2 py-2 font-mono">{r.function_name}</td>
                <td className="px-2 py-2">
                  <Badge style={SHARP} className={`uppercase tracking-brand text-[10px] ${r.ok ? "bg-green-600 text-white" : "bg-destructive text-destructive-foreground"}`}>
                    {r.ok ? "OK" : "FAIL"}
                  </Badge>
                  {r.alert_fired && (
                    <Badge style={SHARP} className="ml-1 uppercase tracking-brand text-[10px] bg-amber-500 text-black">Alert</Badge>
                  )}
                </td>
                <td className="px-2 py-2 tabular-nums">{r.status_code ?? "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.latency_ms != null ? `${r.latency_ms}ms` : "—"}</td>
                <td className="px-2 py-2" title={new Date(r.checked_at).toLocaleString()}>{relTime(r.checked_at)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.consecutive_failures}</td>
                <td className="px-2 py-2 text-destructive max-w-[280px] truncate" title={r.error ?? ""}>{r.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

function Tile({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <>
      <Seo noindex title="Kennel Self Health" />
    <div className="border border-border bg-card p-3" style={SHARP}>
      <div className="text-[10px] uppercase tracking-brand text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${accent ?? "text-foreground"}`}>{value}</div>
    </div>
    </>
  );
}