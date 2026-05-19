import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Database, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const SHARP = { borderRadius: 0 } as const;
const TARGETS = ["meta", "google", "instacart", "mailchimp_sync"] as const;

type Run = {
  id: string;
  run_at: string;
  target: string;
  status: string;
  attempts: number;
  duration_ms: number | null;
  error: string | null;
};

function relTime(iso: string | null) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function IngestionStatusPanel() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc("kennel_ingest_runs_recent", { _limit: 80 });
    if (!error) setRuns((data as Run[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-nightly-ingest", { body: { days: 7 } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Nightly ingest complete (${(data as any)?.ok_count}/${(data as any)?.total} ok)`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Ingest failed");
    } finally {
      setRunning(false);
    }
  };

  // Group: latest run per target
  const latest: Record<string, Run | undefined> = {};
  for (const r of runs) if (!latest[r.target]) latest[r.target] = r;

  const failed = TARGETS.filter((t) => latest[t]?.status === "failed").length;

  return (
    <Card className="p-4 md:p-5 border-2" style={SHARP}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="font-bold uppercase tracking-brand text-foreground">Nightly ingestion</h3>
          {failed > 0 ? (
            <Badge className="bg-destructive text-destructive-foreground" style={SHARP}>{failed} failed</Badge>
          ) : (
            <Badge className="bg-primary text-primary-foreground" style={SHARP}>healthy</Badge>
          )}
          <span className="text-[11px] text-muted-foreground">runs 07:00 UTC · 3× retry · exp backoff</span>
        </div>
        <Button size="sm" variant="outline" style={SHARP} onClick={runNow} disabled={running}>
          <RefreshCw className={`h-3 w-3 mr-1 ${running ? "animate-spin" : ""}`} /> Run now
        </Button>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1 pr-2 uppercase tracking-brand">Target</th>
                <th className="text-left py-1 pr-2 uppercase tracking-brand">Last run</th>
                <th className="text-left py-1 pr-2 uppercase tracking-brand">Status</th>
                <th className="text-left py-1 pr-2 uppercase tracking-brand">Attempts</th>
                <th className="text-right py-1 uppercase tracking-brand">Duration</th>
              </tr>
            </thead>
            <tbody>
              {TARGETS.map((t) => {
                const r = latest[t];
                const ok = r?.status === "ok";
                return (
                  <tr key={t} className="border-b border-border/50">
                    <td className="py-1 pr-2 font-mono">{t}</td>
                    <td className="py-1 pr-2 text-muted-foreground">{relTime(r?.run_at ?? null)}</td>
                    <td className="py-1 pr-2">
                      {!r ? (
                        <span className="text-muted-foreground inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> never</span>
                      ) : ok ? (
                        <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="h-3 w-3" /> ok</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive" title={r.error ?? ""}><XCircle className="h-3 w-3" /> failed</span>
                      )}
                    </td>
                    <td className="py-1 pr-2 font-mono">{r?.attempts ?? "—"}</td>
                    <td className="py-1 text-right text-muted-foreground">{r?.duration_ms ? `${r.duration_ms}ms` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {runs.some((r) => r.status === "failed") && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Recent failures</summary>
              <ul className="mt-2 space-y-1">
                {runs.filter((r) => r.status === "failed").slice(0, 5).map((r) => (
                  <li key={r.id} className="font-mono text-destructive">
                    {relTime(r.run_at)} · {r.target} · {r.error?.slice(0, 200)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}