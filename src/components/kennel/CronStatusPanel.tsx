import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const SHARP = { borderRadius: 0 } as const;

type CronJob = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  last_run_status: string | null;
  last_run_duration_ms: number | null;
  last_run_return_message: string | null;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function staleness(iso: string | null, schedule: string): "ok" | "warn" | "stale" {
  if (!iso) return "stale";
  const diffMins = (Date.now() - new Date(iso).getTime()) / 60000;
  // Hourly job → stale after 2h. Daily job → stale after 26h. */5 → stale after 15min.
  if (schedule.startsWith("*/5")) return diffMins > 15 ? "stale" : diffMins > 10 ? "warn" : "ok";
  if (schedule.startsWith("0 *")) return diffMins > 120 ? "stale" : diffMins > 75 ? "warn" : "ok";
  // Daily-ish schedules
  return diffMins > 60 * 26 ? "stale" : diffMins > 60 * 24 ? "warn" : "ok";
}

export function CronStatusPanel() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("kennel_cron_status");
    if (error) setError(error.message);
    else { setJobs((data as CronJob[]) ?? []); setError(null); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (error) {
    return (
      <Card className="p-4 border-2 border-destructive" style={SHARP}>
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" /> Cron status: {error}
        </div>
      </Card>
    );
  }

  const failed = jobs.filter((j) => j.last_run_status === "failed").length;
  const stale = jobs.filter((j) => staleness(j.last_run_started_at, j.schedule) === "stale").length;

  return (
    <Card className="p-4 md:p-5 border-2" style={SHARP}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="font-bold uppercase tracking-brand text-foreground">Scheduler health</h3>
          {failed > 0 && (
            <Badge className="bg-destructive text-destructive-foreground" style={SHARP}>
              {failed} failed
            </Badge>
          )}
          {stale > 0 && (
            <Badge variant="outline" style={SHARP} className="border-destructive text-destructive">
              {stale} stale
            </Badge>
          )}
          {failed === 0 && stale === 0 && jobs.length > 0 && (
            <Badge className="bg-primary text-primary-foreground" style={SHARP}>
              all healthy
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" style={SHARP} onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="text-xs text-muted-foreground">No kennel cron jobs scheduled.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1 pr-2 uppercase tracking-brand">Job</th>
                <th className="text-left py-1 pr-2 uppercase tracking-brand">Schedule</th>
                <th className="text-left py-1 pr-2 uppercase tracking-brand">Last run</th>
                <th className="text-left py-1 pr-2 uppercase tracking-brand">Status</th>
                <th className="text-right py-1 uppercase tracking-brand">Duration</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const s = staleness(j.last_run_started_at, j.schedule);
                const succeeded = j.last_run_status === "succeeded";
                return (
                  <tr key={j.jobid} className="border-b border-border/50">
                    <td className="py-1 pr-2 font-mono">{j.jobname}</td>
                    <td className="py-1 pr-2 font-mono text-muted-foreground">{j.schedule}</td>
                    <td className="py-1 pr-2">
                      <span className={
                        s === "stale" ? "text-destructive font-bold" :
                        s === "warn"  ? "text-foreground"           :
                                        "text-muted-foreground"
                      }>
                        {relativeTime(j.last_run_started_at)}
                      </span>
                    </td>
                    <td className="py-1 pr-2">
                      {j.last_run_status === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : succeeded ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <CheckCircle2 className="h-3 w-3" /> ok
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive" title={j.last_run_return_message ?? ""}>
                          <XCircle className="h-3 w-3" /> {j.last_run_status}
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right text-muted-foreground">
                      {j.last_run_duration_ms ? `${Math.round(j.last_run_duration_ms)}ms` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
