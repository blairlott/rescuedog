import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingDown } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";

type Row = {
  membership_id: string;
  user_id: string | null;
  tier_name: string | null;
  joined_at: string | null;
  cancelled_at: string;
  cancellation_reason: string | null;
  cancellation_source: string | null;
  origin: string | null;
  is_legacy_member: boolean | null;
  tenure_days: number | null;
  cancelled_month: string;
};

const REASON_LABELS: Record<string, string> = {
  too_expensive: "Too expensive",
  shipping_delays: "Shipping delays",
  too_much_wine: "Too much wine",
  not_the_right_wines: "Wrong wine fit",
  moving: "Moving / address change",
  financial: "Financial hardship",
  other: "Other",
};

function pretty(reason: string | null): string {
  if (!reason) return "Unspecified";
  return REASON_LABELS[reason] || reason.replace(/_/g, " ");
}

export default function CrmCancellationsPage() {
  const { data: role, isLoading: roleLoading } = useUserRole();

  const { data, isLoading } = useQuery({
    queryKey: ["crm-cancellations"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("wine_club_cancellation_analytics" as any)
        .select("*")
        .order("cancelled_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data as Row[]) || [];
    },
    enabled: !!role?.isAdminOrOwner,
  });

  const stats = useMemo(() => {
    const rows = data || [];
    const total = rows.length;
    const now = Date.now();
    const last30 = rows.filter((r) => now - new Date(r.cancelled_at).getTime() < 30 * 86400000).length;
    const last90 = rows.filter((r) => now - new Date(r.cancelled_at).getTime() < 90 * 86400000).length;
    const avgTenure = rows.length
      ? rows.reduce((s, r) => s + (r.tenure_days || 0), 0) / rows.length
      : 0;

    const byReason = new Map<string, number>();
    rows.forEach((r) => {
      const k = pretty(r.cancellation_reason);
      byReason.set(k, (byReason.get(k) || 0) + 1);
    });
    const reasons = [...byReason.entries()].sort((a, b) => b[1] - a[1]);

    const byMonth = new Map<string, number>();
    rows.forEach((r) => {
      const m = r.cancelled_month?.slice(0, 7) ?? r.cancelled_at.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) || 0) + 1);
    });
    const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    const maxMonth = Math.max(1, ...months.map(([, n]) => n));

    const byTier = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.tier_name || "Unknown tier";
      byTier.set(k, (byTier.get(k) || 0) + 1);
    });
    const tiers = [...byTier.entries()].sort((a, b) => b[1] - a[1]);

    return { total, last30, last90, avgTenure, reasons, months, maxMonth, tiers };
  }, [data]);

  if (roleLoading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!role?.isAdminOrOwner) {
    return <Navigate to="/crm" replace />;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingDown className="h-6 w-6 text-primary" /> Wine Club Cancellations
        </h1>
        <p className="text-sm text-muted-foreground">
          Reasons, tenure, and trend data for every cancelled membership.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Total cancelled</div>
          <div className="text-3xl font-bold mt-1">{stats.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Last 30 days</div>
          <div className="text-3xl font-bold mt-1">{stats.last30}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Last 90 days</div>
          <div className="text-3xl font-bold mt-1">{stats.last90}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Avg tenure</div>
          <div className="text-3xl font-bold mt-1">{stats.avgTenure.toFixed(0)}d</div>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Top reasons</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {stats.reasons.length === 0 && (
                <p className="text-sm text-muted-foreground">No cancellations yet.</p>
              )}
              {stats.reasons.map(([reason, count]) => {
                const pct = stats.total ? (count / stats.total) * 100 : 0;
                return (
                  <div key={reason}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{reason}</span>
                      <span className="text-muted-foreground font-mono">{count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-muted">
                      <div className="h-2 bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Last 12 months</CardTitle></CardHeader>
            <CardContent>
              {stats.months.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history.</p>
              ) : (
                <div className="flex items-end gap-1 h-40">
                  {stats.months.map(([m, n]) => (
                    <div key={m} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[10px] font-mono">{n}</div>
                      <div
                        className="w-full bg-primary"
                        style={{ height: `${(n / stats.maxMonth) * 100}%`, minHeight: "2px" }}
                      />
                      <div className="text-[10px] text-muted-foreground rotate-45 origin-left translate-y-2">
                        {m.slice(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">By tier</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {stats.tiers.map(([t, n]) => (
                <div key={t} className="flex items-center justify-between text-sm">
                  <span>{t}</span>
                  <Badge variant="secondary">{n}</Badge>
                </div>
              ))}
              {stats.tiers.length === 0 && (
                <p className="text-sm text-muted-foreground">No data.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Most recent</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {(data || []).slice(0, 25).map((r) => (
                <div key={r.membership_id} className="text-xs border-b border-border pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.tier_name || "Unknown tier"}</span>
                    <span className="text-muted-foreground">
                      {new Date(r.cancelled_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {pretty(r.cancellation_reason)} · {r.cancellation_source || "—"} · {Math.round(r.tenure_days || 0)}d tenure
                    {r.is_legacy_member && <Badge variant="outline" className="ml-1">legacy</Badge>}
                  </div>
                </div>
              ))}
              {(data || []).length === 0 && (
                <p className="text-sm text-muted-foreground">No cancellations.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}