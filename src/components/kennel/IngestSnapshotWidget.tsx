import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Activity, CheckCircle2, XCircle, Radio, Loader2, RotateCw, AlertTriangle } from "lucide-react";

const SHARP = { borderRadius: 0 } as const;
const CHANNELS = ["meta", "google", "instacart", "mailchimp_sync"] as const;
const LINDY_SOURCES = ["lindy_external", "z8", "lindy"] as const;

type Run = {
  id: string;
  run_at: string;
  target: string;
  status: string;
  duration_ms: number | null;
  payload: any;
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

/** Best-effort extraction of upsert counts from a payload shape that varies per ingestor. */
function upsertCounts(p: any): { upserts: number | null; inserted: number | null; updated: number | null } {
  if (!p || typeof p !== "object") return { upserts: null, inserted: null, updated: null };
  const s = p.summary && typeof p.summary === "object" ? p.summary : p;
  const num = (v: any) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
  const inserted = num(s.inserted ?? s.new ?? s.created);
  const updated = num(s.updated ?? s.modified);
  const explicit = num(s.upserts ?? s.upserted);
  const total = num(s.total ?? s.rows ?? s.count);
  const upserts =
    explicit ??
    (inserted !== null || updated !== null ? (inserted ?? 0) + (updated ?? 0) : total);
  return { upserts, inserted, updated };
}

export function IngestSnapshotWidget() {
  const qc = useQueryClient();
  const [days, setDays] = useState<number>(7);
  const [rerunning, setRerunning] = useState<string | null>(null);

  const { data: runs, isLoading } = useQuery({
    queryKey: ["kennel-ingest-snapshot"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("kennel_ingest_runs_recent", { _limit: 80 });
      if (error) throw error;
      return (data ?? []) as Run[];
    },
    refetchInterval: 60_000,
  });

  const { data: lindyLast } = useQuery({
    queryKey: ["kennel-z8-last"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kennel_insights")
        .select("created_at, source, title")
        .in("source", LINDY_SOURCES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  // Latest run per channel
  const latest: Record<string, Run | undefined> = {};
  for (const r of runs ?? []) if (!latest[r.target]) latest[r.target] = r;

  const z8Time = lindyLast?.created_at ?? null;

  async function rerun(target: string | "all") {
    const key = target;
    setRerunning(key);
    try {
      const payload: { days: number; targets?: string[] } = { days };
      if (target !== "all") payload.targets = [target];
      const { data, error } = await supabase.functions.invoke("kennel-nightly-ingest", { body: payload });
      if (error) throw error;
      const summary = (data as any)?.summary ?? [];
      const failed = summary.filter((s: any) => !s.ok);
      if (failed.length === 0) {
        toast.success(
          target === "all"
            ? `Re-ran ${summary.length} target(s) for last ${days}d`
            : `Re-ran ${target} for last ${days}d`,
        );
      } else {
        toast.error(`Re-run completed with ${failed.length} failure(s): ${failed.map((f: any) => f.target).join(", ")}`);
      }
      await qc.invalidateQueries({ queryKey: ["kennel-ingest-snapshot"] });
    } catch (e: any) {
      toast.error(`Re-run failed: ${e?.message ?? String(e)}`);
    } finally {
      setRerunning(null);
    }
  }

  return (
    <Card className="p-4 md:p-5 border-2" style={SHARP}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="font-bold uppercase tracking-brand text-foreground text-sm">
            Snapshot upserts · last run per channel
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] uppercase tracking-brand text-muted-foreground">Last Z8 signal</span>
          {z8Time ? (
            <Badge className="bg-primary text-primary-foreground" style={SHARP}>
              {relTime(z8Time)}
            </Badge>
          ) : (
            <Badge variant="outline" style={SHARP}>never</Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border flex-wrap">
        <span className="text-[11px] uppercase tracking-brand text-muted-foreground">Manual re-run window:</span>
        <Input
          type="number"
          min={1}
          max={30}
          value={days}
          onChange={(e) => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
          className="h-7 w-16 text-xs"
          style={SHARP}
        />
        <span className="text-[11px] text-muted-foreground">days back (max 30)</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => rerun("all")}
          disabled={rerunning !== null}
          className="h-7 ml-auto"
          style={SHARP}
        >
          {rerunning === "all" ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <RotateCw className="h-3 w-3 mr-1" />
          )}
          Re-run all
        </Button>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1 pr-3 uppercase tracking-brand">Channel</th>
                <th className="text-left py-1 pr-3 uppercase tracking-brand">Status</th>
                <th className="text-left py-1 pr-3 uppercase tracking-brand">Last run</th>
                <th className="text-right py-1 pr-3 uppercase tracking-brand">Upserts</th>
                <th className="text-right py-1 pr-3 uppercase tracking-brand">New</th>
                <th className="text-right py-1 pr-3 uppercase tracking-brand">Updated</th>
                <th className="text-right py-1 uppercase tracking-brand">Action</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((t) => {
                const r = latest[t];
                const ok = r?.status === "ok";
                const c = upsertCounts(r?.payload);
                const zeroUpserts = c.upserts === 0;
                const flagged = !r || !ok || zeroUpserts;
                return (
                  <tr
                    key={t}
                    className={`border-b border-border/50 ${flagged ? "bg-destructive/5" : ""}`}
                  >
                    <td className="py-1.5 pr-3 font-mono font-bold">{t}</td>
                    <td className="py-1.5 pr-3">
                      {!r ? (
                        <span className="text-muted-foreground">—</span>
                      ) : ok ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <CheckCircle2 className="h-3 w-3" /> ok
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="h-3 w-3" /> failed
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{relTime(r?.run_at ?? null)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono font-bold">
                      {zeroUpserts ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-3 w-3" /> 0
                        </span>
                      ) : (
                        c.upserts ?? "—"
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-muted-foreground">
                      {c.inserted ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-muted-foreground">
                      {c.updated ?? "—"}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        size="sm"
                        variant={flagged ? "default" : "ghost"}
                        onClick={() => rerun(t)}
                        disabled={rerunning !== null}
                        className="h-6 px-2 text-[10px] uppercase tracking-brand"
                        style={SHARP}
                      >
                        {rerunning === t ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <RotateCw className="h-3 w-3 mr-1" /> Re-run
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 text-[10px] uppercase tracking-brand text-muted-foreground">
            Z8 (lindy_external) {z8Time ? `last fired ${relTime(z8Time)} · ${new Date(z8Time).toLocaleString()}` : "has not fired yet"}
          </div>
        </div>
      )}
    </Card>
  );
}