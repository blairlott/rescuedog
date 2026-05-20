import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Sparkles, ChevronRight, AlertTriangle } from "lucide-react";

const SHARP = { borderRadius: 0 } as const;

async function fetchHealth() {
  // Latest row per function in last 24h
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("kennel_self_health" as any)
    .select("function_name, ok, checked_at, consecutive_failures, alert_fired")
    .gte("checked_at", since)
    .order("checked_at", { ascending: false })
    .limit(500);
  const latest = new Map<string, any>();
  for (const r of (data as any[]) ?? []) {
    if (!latest.has(r.function_name)) latest.set(r.function_name, r);
  }
  const rows = Array.from(latest.values());
  return {
    failing: rows.filter((r) => !r.ok).length,
    alerts: rows.filter((r) => r.alert_fired).length,
  };
}

async function fetchProposals() {
  const { data } = await supabase
    .from("kennel_rule_suggestions" as any)
    .select("id, confidence")
    .eq("status", "pending");
  const rows = (data as any[]) ?? [];
  return {
    pending: rows.length,
    highConf: rows.filter((r) => Number(r.confidence ?? 0) >= 0.85).length,
  };
}

export function KennelSystemHealthStrip() {
  const health = useQuery({ queryKey: ["kennel-strip-health"], queryFn: fetchHealth, refetchInterval: 60_000 });
  const props = useQuery({ queryKey: ["kennel-strip-proposals"], queryFn: fetchProposals, refetchInterval: 60_000 });

  const failing = health.data?.failing ?? 0;
  const pending = props.data?.pending ?? 0;
  const highConf = props.data?.highConf ?? 0;

  if (failing === 0 && pending === 0) return null;

  return (
    <div className="flex flex-wrap items-stretch gap-2 px-4 md:px-6 pt-3">
      {failing > 0 && (
        <Link
          to="/kennel/self-health"
          className="flex items-center gap-2 px-3 py-2 bg-destructive text-destructive-foreground border-2 border-foreground hover:opacity-90"
          style={SHARP}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs uppercase tracking-brand font-bold">
            {failing} endpoint{failing === 1 ? "" : "s"} failing
          </span>
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
      {highConf > 0 && (
        <Link
          to="/kennel/proposals"
          className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-black border-2 border-foreground hover:opacity-90"
          style={SHARP}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="text-xs uppercase tracking-brand font-bold">
            {highConf} high-confidence rule{highConf === 1 ? "" : "s"} to review
          </span>
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
      {pending > 0 && highConf === 0 && (
        <Link
          to="/kennel/proposals"
          className="flex items-center gap-2 px-3 py-2 bg-card border border-border text-foreground hover:bg-muted"
          style={SHARP}
        >
          <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-xs uppercase tracking-brand">
            {pending} rule proposal{pending === 1 ? "" : "s"} pending
          </span>
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}