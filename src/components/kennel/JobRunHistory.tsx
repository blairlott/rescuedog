import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ChevronRight, History } from "lucide-react";

type JobRun = {
  id: string;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: "running" | "ok" | "partial" | "error";
  triggered_by: "cron" | "manual" | "api" | "unknown";
  inputs: any;
  results: any;
  error: string | null;
};

const STATUS_TONE: Record<JobRun["status"], string> = {
  running: "bg-blue-500/15 text-blue-700 border-blue-500/40",
  ok: "bg-green-500/15 text-green-700 border-green-500/40",
  partial: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  error: "bg-destructive/15 text-destructive border-destructive/40",
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}
function dur(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function JobRunHistory({ jobName, title, limit = 25 }: { jobName: string; title?: string; limit?: number }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["kennel-job-runs", jobName, limit],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kennel_job_runs" as any)
        .select("*")
        .eq("job_name", jobName)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as unknown as JobRun[]) ?? [];
    },
  });

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {title ?? "Run history"}
          </h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-none border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">Summary</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</td></tr>
            )}
            {!isLoading && !data?.length && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No runs recorded yet.</td></tr>
            )}
            {data?.map((r) => {
              const open = openIds.has(r.id);
              const summary = summarize(r);
              return (
                <Fragment key={r.id}>
                  <tr className="border-t border-border hover:bg-muted/30">
                    <td className="px-2 py-2 align-top">
                      <button onClick={() => toggle(r.id)} className="text-muted-foreground hover:text-foreground">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">{fmt(r.started_at)}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">{dur(r.duration_ms)}</td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant="outline" className={`rounded-none ${STATUS_TONE[r.status]}`}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-muted-foreground">{r.triggered_by}</td>
                    <td className="px-3 py-2 align-top text-xs">{summary}</td>
                  </tr>
                  {open && (
                    <tr className="border-t border-border bg-muted/20">
                      <td></td>
                      <td colSpan={5} className="px-3 py-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Inputs</div>
                            <pre className="max-h-64 overflow-auto rounded-none border border-border bg-background p-2 text-xs">{JSON.stringify(r.inputs, null, 2)}</pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Results</div>
                            <pre className="max-h-64 overflow-auto rounded-none border border-border bg-background p-2 text-xs">{JSON.stringify(r.results, null, 2)}</pre>
                          </div>
                          {r.error && (
                            <div className="md:col-span-2">
                              <div className="mb-1 text-xs font-semibold uppercase text-destructive">Error</div>
                              <pre className="max-h-40 overflow-auto rounded-none border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{r.error}</pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function summarize(r: JobRun): string {
  const x = r.results ?? {};
  if (r.job_name === "segflow_compute_and_tag") {
    if (r.status === "error") return r.error ?? "compute failed";
    return `${x.diff_count ?? 0} changed · ${x.pushed ?? 0} pushed · ${x.skipped ?? 0} skipped · ${x.failed ?? 0} failed${x.dry_run ? " (dry run)" : ""}`;
  }
  if (r.job_name === "tiered_seeds_monthly") {
    if (r.status === "error") return r.error ?? "all tiers failed";
    return `${(x.total_matched ?? 0).toLocaleString()} matched · ${(x.total_pushed ?? 0).toLocaleString()} pushed · ${x.failures ?? 0} failures`;
  }
  return "";
}