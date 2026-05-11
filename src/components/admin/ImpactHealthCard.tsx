import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Check = {
  id: string;
  check_type: string;
  target: string | null;
  status: "ok" | "warning" | "error";
  http_status: number | null;
  latency_ms: number | null;
  message: string | null;
  checked_at: string;
};

const POLL_MS = 5 * 60 * 1000; // re-run every 5 minutes while page is open

function StatusIcon({ status }: { status: string }) {
  if (status === "ok") return <CheckCircle2 className="w-4 h-4 text-green-600" />;
  if (status === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
  return <XCircle className="w-4 h-4 text-destructive" />;
}

export function ImpactHealthCard() {
  const [latest, setLatest] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadLatest = useCallback(async () => {
    // Get most recent check per check_type+target
    const { data } = await supabase
      .from("impact_health_checks")
      .select("*")
      .order("checked_at", { ascending: false })
      .limit(50);
    if (!data) { setLatest([]); return; }
    const seen = new Set<string>();
    const dedup: Check[] = [];
    for (const row of data as Check[]) {
      const key = `${row.check_type}::${row.target ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(row);
    }
    setLatest(dedup);
  }, []);

  const runCheck = useCallback(async (silent = false) => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("impact-health-check");
      if (error) throw error;
      await loadLatest();
      if (!silent) toast.success("Impact health check complete");
    } catch (err: any) {
      if (!silent) toast.error(err.message || "Health check failed");
    } finally {
      setRunning(false);
    }
  }, [loadLatest]);

  useEffect(() => {
    (async () => {
      await loadLatest();
      setLoading(false);
      // Auto-run on first load if newest check older than POLL_MS
      const { data } = await supabase.from("impact_health_checks").select("checked_at").order("checked_at", { ascending: false }).limit(1);
      const newest = data?.[0]?.checked_at;
      if (!newest || Date.now() - new Date(newest).getTime() > POLL_MS) {
        runCheck(true);
      }
    })();
    const t = setInterval(() => runCheck(true), POLL_MS);
    return () => clearInterval(t);
  }, [loadLatest, runCheck]);

  const overall: "ok" | "warning" | "error" =
    latest.some(c => c.status === "error") ? "error"
    : latest.some(c => c.status === "warning") ? "warning"
    : "ok";

  return (
    <div className="border border-border p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h2 className="font-bold uppercase text-sm tracking-wide">impact.com Connection Health</h2>
          {!loading && (
            <Badge variant={overall === "ok" ? "default" : overall === "warning" ? "secondary" : "destructive"} className="uppercase">
              <StatusIcon status={overall} />
              <span className="ml-1">{overall}</span>
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">Auto-runs every 5 min while this page is open</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => runCheck()} disabled={running}>
          {running ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          Run now
        </Button>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : latest.length === 0 ? (
        <p className="text-xs text-muted-foreground">No checks yet — running first check…</p>
      ) : (
        <div className="text-xs divide-y divide-border">
          {latest.map(c => (
            <div key={c.id} className="py-2 flex items-start gap-3">
              <StatusIcon status={c.status} />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[11px] truncate">
                  <span className="font-bold uppercase">{c.check_type}</span>
                  {c.target && <span className="text-muted-foreground"> · {c.target}</span>}
                </div>
                <div className="text-muted-foreground">
                  {c.message}
                  {c.latency_ms !== null && ` · ${c.latency_ms}ms`}
                  {c.http_status !== null && ` · HTTP ${c.http_status}`}
                </div>
              </div>
              <div className="text-muted-foreground text-[10px] whitespace-nowrap">
                {new Date(c.checked_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}