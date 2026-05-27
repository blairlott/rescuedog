import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Mail, TrendingUp, AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

type Cohort = {
  customer_email: string;
  acquisition_month: string;
  orders_count: number;
  lifetime_revenue_cents: number;
  avg_order_value_cents: number;
  days_since_last_order: number | null;
  is_club_member: boolean;
  segment: string | null;
  churn_probability: number | null;
  predicted_ltv_cents: number | null;
  state: string | null;
};

type DigestRun = {
  id: string;
  digest_date: string;
  summary: any;
  email_status: string;
  recipients: string[];
  created_at: string;
};

function dollars(cents: number | null | undefined) {
  return `$${Math.round((cents ?? 0) / 100).toLocaleString()}`;
}

export default function CrmIntelligencePage() {
  const qc = useQueryClient();

  const { data: cohorts, isLoading } = useQuery({
    queryKey: ["customer-cohorts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_cohorts" as any)
        .select("*")
        .order("lifetime_revenue_cents", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Cohort[];
    },
  });

  const { data: digests } = useQuery({
    queryKey: ["ops-digest-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ops_digest_runs" as any)
        .select("id, digest_date, summary, email_status, recipients, created_at")
        .order("digest_date", { ascending: false })
        .limit(14);
      if (error) throw error;
      return (data ?? []) as unknown as DigestRun[];
    },
  });

  const rebuild = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("customer-cohorts-rebuild", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Rebuilt ${d?.upserted ?? 0} customer cohorts`);
      qc.invalidateQueries({ queryKey: ["customer-cohorts"] });
    },
    onError: (e: any) => toast.error(e.message || "Rebuild failed"),
  });

  const sendDigest = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ops-daily-digest", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Digest sent");
      qc.invalidateQueries({ queryKey: ["ops-digest-runs"] });
    },
    onError: (e: any) => toast.error(e.message || "Digest failed"),
  });

  // KPI rollups
  const list = cohorts ?? [];
  const totalLtv = list.reduce((s, r) => s + (r.lifetime_revenue_cents ?? 0), 0);
  const predictedLtv = list.reduce((s, r) => s + (r.predicted_ltv_cents ?? 0), 0);
  const atRisk = list.filter((r) => (r.churn_probability ?? 0) >= 0.6 && (r.lifetime_revenue_cents ?? 0) >= 20_000);
  const champions = list.filter((r) => r.segment === "champion");
  const clubMembers = list.filter((r) => r.is_club_member);

  // Segment counts
  const segments = ["champion", "loyal", "regular", "club_member", "at_risk", "lost", "one_time"];
  const segmentCounts = segments.map((s) => ({
    segment: s,
    count: list.filter((r) => r.segment === s).length,
    revenue: list.filter((r) => r.segment === s).reduce((sum, r) => sum + (r.lifetime_revenue_cents ?? 0), 0),
  }));

  // Cohort matrix: rows = acquisition_month, cols = ordersBucket
  const cohortMap = new Map<string, { customers: number; revenue: number; predicted: number }>();
  for (const c of list) {
    const month = c.acquisition_month?.slice(0, 7) ?? "unknown";
    const cur = cohortMap.get(month) ?? { customers: 0, revenue: 0, predicted: 0 };
    cur.customers += 1;
    cur.revenue += c.lifetime_revenue_cents ?? 0;
    cur.predicted += c.predicted_ltv_cents ?? 0;
    cohortMap.set(month, cur);
  }
  const cohortRows = Array.from(cohortMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 24);

  return (
    <>
      <Seo noindex title="Crm Intelligence" />
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Customer Intelligence</h1>
          <p className="text-muted-foreground text-sm">Churn risk, LTV cohorts, and the morning ops digest.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => rebuild.mutate()} disabled={rebuild.isPending} variant="outline">
            {rebuild.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Rebuild cohorts
          </Button>
          <Button onClick={() => sendDigest.mutate()} disabled={sendDigest.isPending}>
            {sendDigest.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Send digest now
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Customers tracked</div>
          <div className="text-2xl font-bold mt-1">{list.length.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Realized LTV</div>
          <div className="text-2xl font-bold mt-1">{dollars(totalLtv)}</div>
          <div className="text-xs text-muted-foreground mt-1">Predicted: {dollars(predictedLtv)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" />High-LTV at risk</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{atRisk.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{dollars(atRisk.reduce((s, r) => s + r.lifetime_revenue_cents, 0))} LTV exposed</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />Club / Champions</div>
          <div className="text-2xl font-bold mt-1">{clubMembers.length} / {champions.length}</div>
        </Card>
      </div>

      {/* Segments */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Segment breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {segmentCounts.map((s) => (
            <div key={s.segment} className="border p-3 text-center">
              <div className="text-xs uppercase text-muted-foreground">{s.segment.replace(/_/g, " ")}</div>
              <div className="text-xl font-bold mt-1">{s.count}</div>
              <div className="text-xs text-muted-foreground">{dollars(s.revenue)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* At-risk table */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Top at-risk customers ($200+ LTV, ≥60% churn)</h2>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : atRisk.length === 0 ? (
          <p className="text-sm text-muted-foreground">None right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2">Email</th>
                  <th className="py-2 text-right">LTV</th>
                  <th className="py-2 text-right">Orders</th>
                  <th className="py-2 text-right">Idle</th>
                  <th className="py-2 text-right">Churn</th>
                  <th className="py-2 text-right">Predicted LTV</th>
                  <th className="py-2">State</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.slice(0, 50).map((r) => (
                  <tr key={r.customer_email} className="border-b hover:bg-muted/40">
                    <td className="py-2 font-mono text-xs">{r.customer_email}</td>
                    <td className="py-2 text-right">{dollars(r.lifetime_revenue_cents)}</td>
                    <td className="py-2 text-right">{r.orders_count}</td>
                    <td className="py-2 text-right">{r.days_since_last_order}d</td>
                    <td className="py-2 text-right">
                      <Badge variant="destructive">{Math.round((r.churn_probability ?? 0) * 100)}%</Badge>
                    </td>
                    <td className="py-2 text-right">{dollars(r.predicted_ltv_cents)}</td>
                    <td className="py-2 text-xs">{r.state ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Cohort matrix */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">LTV by acquisition cohort (last 24 months)</h2>
        {cohortRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cohorts yet — click "Rebuild cohorts" to compute from order history.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2">Acquisition month</th>
                  <th className="py-2 text-right">Customers</th>
                  <th className="py-2 text-right">Realized LTV</th>
                  <th className="py-2 text-right">Avg LTV / customer</th>
                  <th className="py-2 text-right">Predicted LTV</th>
                </tr>
              </thead>
              <tbody>
                {cohortRows.map(([month, s]) => (
                  <tr key={month} className="border-b">
                    <td className="py-2 font-mono">{month}</td>
                    <td className="py-2 text-right">{s.customers}</td>
                    <td className="py-2 text-right">{dollars(s.revenue)}</td>
                    <td className="py-2 text-right">{dollars(Math.round(s.revenue / Math.max(s.customers, 1)))}</td>
                    <td className="py-2 text-right text-muted-foreground">{dollars(s.predicted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent digests */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Recent ops digests</h2>
        {!digests || digests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No digests sent yet. Configure recipients in app_settings.ops_digest_recipients (JSON array of emails).</p>
        ) : (
          <div className="space-y-2">
            {digests.map((d) => (
              <div key={d.id} className="border p-3 text-sm flex items-center justify-between">
                <div>
                  <div className="font-semibold">{d.digest_date}</div>
                  <div className="text-xs text-muted-foreground">
                    {dollars(d.summary?.revenue_cents)} · {d.summary?.orders ?? 0} orders · {d.summary?.club_joins ?? 0} joins · {d.summary?.club_cancels ?? 0} cancels · {d.summary?.at_risk_count ?? 0} at-risk
                  </div>
                </div>
                <Badge variant={d.email_status === "sent" ? "default" : "destructive"}>{d.email_status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
    </>
  );
}