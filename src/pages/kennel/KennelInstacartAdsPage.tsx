import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/kennel/MetricCard";
import { ExternalLink, Upload, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const PLATFORM = "instacart";

function dollars(cents: number | null | undefined) {
  return `$${((cents ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function pct(n: number | null | undefined, digits = 1) {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export default function KennelInstacartAdsPage() {
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const [kind, setKind] = useState<"campaigns" | "keywords" | "search_terms">("campaigns");
  const [busy, setBusy] = useState(false);

  const { data: campaigns = [] } = useQuery({
    queryKey: ["instacart-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_campaigns" as any)
        .select("*")
        .eq("platform_slug", PLATFORM)
        .order("spend_mtd_cents", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: keywords = [] } = useQuery({
    queryKey: ["instacart-keywords"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_keywords" as any)
        .select("*")
        .eq("platform_slug", PLATFORM)
        .order("spend_30d_cents", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: searchTerms = [] } = useQuery({
    queryKey: ["instacart-search-terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_search_terms" as any)
        .select("*")
        .eq("platform_slug", PLATFORM)
        .is("resolved_at", null)
        .order("spend_cents", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const totals = useMemo(() => {
    const spend = campaigns.reduce((a, c) => a + (c.spend_mtd_cents || 0), 0);
    const sales = campaigns.reduce((a, c) => a + (c.sales_mtd_cents || 0), 0);
    const impr = campaigns.reduce((a, c) => a + Number(c.impressions_mtd || 0), 0);
    const clicks = campaigns.reduce((a, c) => a + Number(c.clicks_mtd || 0), 0);
    return {
      spend, sales,
      roas: spend > 0 ? sales / spend : 0,
      acos: sales > 0 ? spend / sales : 0,
      ctr: impr > 0 ? clicks / impr : 0,
      active: campaigns.filter((c) => c.status === "enabled").length,
    };
  }, [campaigns]);

  async function ingestCsv() {
    if (!csv.trim()) { toast.error("Paste a CSV first"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("instacart-ads-ingest", {
        body: { mode: "csv", kind, csv },
      });
      if (error) throw error;
      toast.success(`Ingested ${data?.rows ?? 0} rows`);
      setCsv("");
      qc.invalidateQueries({ queryKey: ["instacart-campaigns"] });
      qc.invalidateQueries({ queryKey: ["instacart-keywords"] });
      qc.invalidateQueries({ queryKey: ["instacart-search-terms"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Ingest failed");
    } finally {
      setBusy(false);
    }
  }

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
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-brand">Instacart Ads Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sponsored Product + off-platform/Carrot. Partner API write access pending — read-only until INSTACART_PARTNER_API_TOKEN is added.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="https://ads.instacart.com" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" /> Open Ads Manager
            </a>
          </Button>
          <Button onClick={runRecommender} disabled={busy}>
            <Sparkles className="h-4 w-4 mr-2" /> Run AI recommender
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Spend MTD" value={dollars(totals.spend)} />
        <MetricCard label="Attributed sales" value={dollars(totals.sales)} />
        <MetricCard label="ROAS" value={totals.roas ? `${totals.roas.toFixed(2)}x` : "—"} />
        <MetricCard label="ACOS" value={pct(totals.acos)} />
        <MetricCard label="Active campaigns" value={String(totals.active)} />
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="keywords">Keywords ({keywords.length})</TabsTrigger>
          <TabsTrigger value="search">Search terms ({searchTerms.length})</TabsTrigger>
          <TabsTrigger value="ingest">Ingest CSV</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <Card><CardContent className="p-0 overflow-x-auto">
            {campaigns.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">
                No campaigns yet. Export from Ads Manager → Ingest tab → upload as <code>campaigns</code>.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left">
                    <th className="p-3">Campaign</th><th className="p-3">Status</th>
                    <th className="p-3 text-right">Daily budget</th><th className="p-3 text-right">Spend</th>
                    <th className="p-3 text-right">Sales</th><th className="p-3 text-right">ROAS</th>
                    <th className="p-3 text-right">Impressions</th><th className="p-3 text-right">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c: any) => {
                    const roas = c.spend_mtd_cents > 0 ? c.sales_mtd_cents / c.spend_mtd_cents : 0;
                    return (
                      <tr key={c.id} className="border-t border-border">
                        <td className="p-3 font-medium">{c.name}</td>
                        <td className="p-3"><Badge variant={c.status === "enabled" ? "default" : "secondary"}>{c.status}</Badge></td>
                        <td className="p-3 text-right tabular-nums">{dollars(c.daily_budget_cents)}</td>
                        <td className="p-3 text-right tabular-nums">{dollars(c.spend_mtd_cents)}</td>
                        <td className="p-3 text-right tabular-nums">{dollars(c.sales_mtd_cents)}</td>
                        <td className="p-3 text-right tabular-nums">{roas ? `${roas.toFixed(2)}x` : "—"}</td>
                        <td className="p-3 text-right tabular-nums">{Number(c.impressions_mtd).toLocaleString()}</td>
                        <td className="p-3 text-right tabular-nums">{Number(c.clicks_mtd).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="keywords">
          <Card><CardContent className="p-0 overflow-x-auto">
            {keywords.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">No keywords ingested yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted"><tr className="text-left">
                  <th className="p-3">Keyword</th><th className="p-3">Match</th><th className="p-3">Status</th>
                  <th className="p-3 text-right">Bid</th><th className="p-3 text-right">Spend</th>
                  <th className="p-3 text-right">Sales</th><th className="p-3 text-right">ACOS</th>
                  <th className="p-3 text-right">Clicks</th><th className="p-3 text-right">Conv</th>
                </tr></thead>
                <tbody>
                  {keywords.map((k: any) => {
                    const acos = k.sales_30d_cents > 0 ? k.spend_30d_cents / k.sales_30d_cents : null;
                    const bad = acos != null && acos > 1;
                    return (
                      <tr key={k.id} className={`border-t border-border ${bad ? "bg-red-50" : ""}`}>
                        <td className="p-3 font-medium">{k.keyword}</td>
                        <td className="p-3"><Badge variant="outline">{k.match_type}</Badge></td>
                        <td className="p-3 text-xs">{k.status}</td>
                        <td className="p-3 text-right tabular-nums">{dollars(k.bid_cents)}</td>
                        <td className="p-3 text-right tabular-nums">{dollars(k.spend_30d_cents)}</td>
                        <td className="p-3 text-right tabular-nums">{dollars(k.sales_30d_cents)}</td>
                        <td className={`p-3 text-right tabular-nums ${bad ? "text-red-700 font-semibold" : ""}`}>{pct(acos)}</td>
                        <td className="p-3 text-right tabular-nums">{Number(k.clicks_30d).toLocaleString()}</td>
                        <td className="p-3 text-right tabular-nums">{k.conversions_30d}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="search">
          <Card><CardContent className="p-0 overflow-x-auto">
            {searchTerms.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">No search-term harvest yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted"><tr className="text-left">
                  <th className="p-3">Search term</th>
                  <th className="p-3 text-right">Spend</th><th className="p-3 text-right">Sales</th>
                  <th className="p-3 text-right">Clicks</th><th className="p-3 text-right">Conv</th>
                  <th className="p-3">Suggested</th>
                </tr></thead>
                <tbody>
                  {searchTerms.map((t: any) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="p-3 font-medium">{t.query}</td>
                      <td className="p-3 text-right tabular-nums">{dollars(t.spend_cents)}</td>
                      <td className="p-3 text-right tabular-nums">{dollars(t.sales_cents)}</td>
                      <td className="p-3 text-right tabular-nums">{Number(t.clicks).toLocaleString()}</td>
                      <td className="p-3 text-right tabular-nums">{t.conversions}</td>
                      <td className="p-3"><Badge variant="outline">{t.suggested_action ?? "review"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ingest">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-brand">Paste a CSV export from Ads Manager</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 items-center">
                <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="campaigns">Campaigns report</SelectItem>
                    <SelectItem value="keywords">Keywords report</SelectItem>
                    <SelectItem value="search_terms">Search terms report</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={ingestCsv} disabled={busy}>
                  {busy ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Ingest
                </Button>
              </div>
              <Textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder={"campaign_id,campaign_name,status,daily_budget,spend,attributed_sales,impressions,clicks,conversions\n12345,Cabernet Brand,enabled,50.00,432.10,1284.55,18432,612,18"}
                rows={12}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Expected headers (case-insensitive, snake_cased): <code>campaign_id, campaign_name, status, daily_budget, spend, attributed_sales, impressions, clicks, conversions</code> for campaigns; <code>keyword, match_type, status, bid, spend, attributed_sales, impressions, clicks, conversions</code> for keywords; <code>search_term, spend, attributed_sales, impressions, clicks, conversions</code> for search terms.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}