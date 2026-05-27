import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/kennel/MetricCard";
import { Sparkles, Search, CheckCircle2, XCircle, Pause, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

function dollars(c: number | null | undefined) { return `$${((c ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function pct(n: number | null | undefined) { return n == null || !isFinite(n) ? "—" : `${(n * 100).toFixed(1)}%`; }

export default function KennelKeywordsPage() {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<string>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["all-keywords", platform],
    queryFn: async () => {
      let query = supabase.from("ad_keywords" as any).select("*").order("spend_30d_cents", { ascending: false }).limit(500);
      if (platform !== "all") query = query.eq("platform_slug", platform);
      const { data, error } = await query;
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["ad-platforms"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_platforms" as any).select("slug,display_name").order("display_name");
      return (data as any[]) ?? [];
    },
  });

  const { data: pendingRecs = [] } = useQuery({
    queryKey: ["all-pending-recs"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_recommendations" as any)
        .select("id,title,summary,confidence,projected_impact_cents,payload,created_at")
        .eq("status", "pending").eq("kind", "keyword_optimization")
        .order("projected_impact_cents", { ascending: false }).limit(50);
      return (data as any[]) ?? [];
    },
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["all-keywords"] });
    qc.invalidateQueries({ queryKey: ["all-pending-recs"] });
  }

  async function executeRec(rec: any) {
    const p = rec.payload ?? {};
    if (p.platform !== "instacart") {
      toast.info(`Auto-execution available only for Instacart today. Apply manually on ${p.platform}.`);
      return;
    }
    const { data: kws } = await supabase.from("ad_keywords" as any).select("id")
      .eq("platform_slug", "instacart").eq("keyword", p.keyword)
      .eq("match_type", String(p.match_type ?? "broad").toLowerCase()).maybeSingle();
    if (!kws) { toast.error("Keyword not found locally"); return; }
    let body: any;
    if (p.action === "raise_bid" || p.action === "lower_bid") {
      body = { action: "set_keyword_bid", keyword_id: (kws as any).id, bid_cents: p.suggested_bid_cents, recommendation_id: rec.id };
    } else if (p.action === "pause") {
      body = { action: "pause_keyword", keyword_id: (kws as any).id, recommendation_id: rec.id };
    } else { toast.error(`Action ${p.action} requires manual handling`); return; }
    const { data, error } = await supabase.functions.invoke("instacart-ads-execute", { body });
    if (error || !(data as any)?.ok) toast.error((error as any)?.message ?? (data as any)?.partner_error ?? "Execute failed");
    else { toast.success(`Executed: ${p.action}`); invalidate(); }
  }

  async function rejectRec(id: string) {
    const { error } = await supabase.from("ad_recommendations" as any)
      .update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Rejected"); invalidate(); }
  }

  const filtered = useMemo(() =>
    rows.filter((r) => !q || r.keyword?.toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  const totals = useMemo(() => {
    const spend = filtered.reduce((a, r) => a + (r.spend_30d_cents || 0), 0);
    const sales = filtered.reduce((a, r) => a + (r.sales_30d_cents || 0), 0);
    const platforms = new Set(filtered.map((r) => r.platform_slug));
    return { spend, sales, count: filtered.length, platforms: platforms.size, acos: sales > 0 ? spend / sales : 0 };
  }, [filtered]);

  // Cross-pollination candidates: keywords on one platform with strong ROAS that don't exist on another
  const opportunities = useMemo(() => {
    const byKw = new Map<string, any[]>();
    rows.forEach((r) => {
      const k = (r.keyword ?? "").toLowerCase();
      if (!byKw.has(k)) byKw.set(k, []);
      byKw.get(k)!.push(r);
    });
    const allPlats = ["instacart", "google_ads", "microsoft_ads", "amazon_ads", "meta_ads"];
    const ops: any[] = [];
    byKw.forEach((rs, k) => {
      const winners = rs.filter((r) => r.sales_30d_cents > 0 && r.spend_30d_cents > 0 && r.sales_30d_cents / r.spend_30d_cents >= 2);
      if (winners.length === 0) return;
      const present = new Set(rs.map((r) => r.platform_slug));
      const missing = allPlats.filter((p) => !present.has(p));
      if (missing.length === 0) return;
      ops.push({ keyword: k, winners, missing });
    });
    return ops.slice(0, 30);
  }, [rows]);

  async function runRecommender() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("keyword-recommender", { body: {} });
      if (error) throw error;
      toast.success(`${data?.saved ?? 0} new recommendations saved`);
    } catch (e: any) {
      toast.error(e?.message ?? "Recommender failed");
    } finally {
      setBusy(false);
      refetch();
    }
  }

  return (
    <>
      <Seo noindex title="Kennel Keywords" />
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-brand">Cross-Platform Keyword Optimizer</h1>
          <p className="text-sm text-muted-foreground mt-1">Unified keyword performance across every paid-search platform we run.</p>
        </div>
        <Button onClick={runRecommender} disabled={busy}>
          <Sparkles className="h-4 w-4 mr-2" /> Run AI recommender
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Keywords" value={String(totals.count)} />
        <MetricCard label="Platforms" value={String(totals.platforms)} />
        <MetricCard label="Spend (30d)" value={dollars(totals.spend)} />
        <MetricCard label="Sales (30d)" value={dollars(totals.sales)} />
        <MetricCard label="Blended ACOS" value={pct(totals.acos)} />
      </div>

      {pendingRecs.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-brand font-semibold text-muted-foreground">
              AI recommendations ({pendingRecs.length})
            </div>
            <div className="space-y-2">
              {pendingRecs.map((r: any) => {
                const p = r.payload ?? {};
                const conf = Number(r.confidence ?? 0);
                return (
                  <div key={r.id} className="flex items-center justify-between border border-border p-3 text-sm gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge>{p.platform ?? "?"}</Badge>
                        <Badge variant="outline">{p.action}</Badge>
                        <span className="font-medium">"{p.keyword}"</span>
                        <span className="text-xs text-muted-foreground">{p.match_type}</span>
                        {p.current_bid_cents ? (
                          <span className="text-xs tabular-nums">
                            {dollars(p.current_bid_cents)} → {dollars(p.suggested_bid_cents)}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">{r.summary ?? p.reason}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Confidence {(conf * 100).toFixed(0)}% · Est. impact {dollars(p.estimated_monthly_impact_cents ?? r.projected_impact_cents)}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" onClick={() => executeRec(r)}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Execute
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => rejectRec(r.id)}>
                        <XCircle className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 items-center flex-wrap">
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {platforms.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter keywords…" className="pl-9" />
        </div>
      </div>

      {opportunities.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-brand font-semibold text-muted-foreground">Cross-pollinate opportunities</div>
            {opportunities.map((op, i) => (
              <div key={i} className="flex items-center justify-between border border-border p-3 text-sm">
                <div>
                  <div className="font-medium">"{op.keyword}"</div>
                  <div className="text-xs text-muted-foreground">
                    Wins on {op.winners.map((w: any) => w.platform_slug).join(", ")} • missing from {op.missing.join(", ")}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">No keywords match the current filter.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr className="text-left">
                <th className="p-3">Platform</th><th className="p-3">Keyword</th><th className="p-3">Match</th>
                <th className="p-3 text-right">Bid</th><th className="p-3 text-right">Spend</th>
                <th className="p-3 text-right">Sales</th><th className="p-3 text-right">ACOS</th>
                <th className="p-3 text-right">Clicks</th><th className="p-3 text-right">Conv</th>
              </tr></thead>
              <tbody>
                {filtered.map((k: any) => {
                  const acos = k.sales_30d_cents > 0 ? k.spend_30d_cents / k.sales_30d_cents : null;
                  return (
                    <tr key={k.id} className="border-t border-border">
                      <td className="p-3"><Badge variant="outline">{k.platform_slug}</Badge></td>
                      <td className="p-3 font-medium">{k.keyword}</td>
                      <td className="p-3 text-xs">{k.match_type}</td>
                      <td className="p-3 text-right tabular-nums">{dollars(k.bid_cents)}</td>
                      <td className="p-3 text-right tabular-nums">{dollars(k.spend_30d_cents)}</td>
                      <td className="p-3 text-right tabular-nums">{dollars(k.sales_30d_cents)}</td>
                      <td className="p-3 text-right tabular-nums">{pct(acos)}</td>
                      <td className="p-3 text-right tabular-nums">{Number(k.clicks_30d).toLocaleString()}</td>
                      <td className="p-3 text-right tabular-nums">{k.conversions_30d}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}