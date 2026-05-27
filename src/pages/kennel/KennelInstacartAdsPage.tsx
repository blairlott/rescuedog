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
import { ExternalLink, Upload, Sparkles, RefreshCw, Pause, Play, ArrowUp, ArrowDown, CheckCircle2, XCircle, Bot } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { InstacartPartnershipPlanner } from "@/components/kennel/InstacartPartnershipPlanner";
import { InstacartCapabilitiesOutline } from "@/components/kennel/InstacartCapabilitiesOutline";
import { InstacartAutopilotHealth } from "@/components/kennel/InstacartAutopilotHealth";
import { Seo } from "@/components/Seo";

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
  const [autopilotBusy, setAutopilotBusy] = useState(false);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["instacart-campaigns"] });
    qc.invalidateQueries({ queryKey: ["instacart-keywords"] });
    qc.invalidateQueries({ queryKey: ["instacart-search-terms"] });
    qc.invalidateQueries({ queryKey: ["instacart-recs"] });
    qc.invalidateQueries({ queryKey: ["instacart-autopilot-settings"] });
    qc.invalidateQueries({ queryKey: ["instacart-actions-log"] });
  }

  // Autopilot settings.
  const { data: settings = [] } = useQuery({
    queryKey: ["instacart-autopilot-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings" as any).select("key,value")
        .like("key", "instacart_autopilot_%");
      return (data as any[]) ?? [];
    },
  });
  const cfg = useMemo(() => {
    const map: Record<string, any> = {};
    settings.forEach((r: any) => { map[r.key] = r.value; });
    return {
      enabled: map.instacart_autopilot_enabled === true,
      confMin: Number(map.instacart_autopilot_confidence_min ?? 0.75),
      maxBidPct: Number(map.instacart_autopilot_max_bid_change_pct ?? 25),
      dailyCap: Number(map.instacart_autopilot_daily_action_cap ?? 20),
    };
  }, [settings]);

  async function setSetting(key: string, value: any) {
    const { error } = await supabase.from("app_settings" as any)
      .upsert({ key, value }, { onConflict: "key" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["instacart-autopilot-settings"] });
  }

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

  const { data: recs = [] } = useQuery({
    queryKey: ["instacart-recs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_instacart_recommendations" as any)
        .select("*").eq("status", "pending")
        .order("projected_impact_cents", { ascending: false }).limit(100);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: log = [] } = useQuery({
    queryKey: ["instacart-actions-log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ad_execution_log" as any)
        .select("id,action,success,error_message,actor_kind,executor,before_value,after_value,request_payload,created_at")
        .eq("platform", "instacart").order("created_at", { ascending: false }).limit(50);
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
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Recommender failed");
    } finally {
      setBusy(false);
    }
  }

  async function runApiSync() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-ingest-instacart", { body: { days: 30 } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Synced ${(data as any)?.total ?? 0} rows from Instacart Partner API`);
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally { setBusy(false); }
  }

  async function runAutopilotNow() {
    setAutopilotBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("instacart-autopilot", { body: {} });
      if (error) throw error;
      const d: any = data;
      toast.success(`Autopilot: ${d?.eligible ?? 0} eligible, ${d?.results?.length ?? 0} executed`);
      invalidateAll();
    } catch (e: any) { toast.error(e?.message ?? "Autopilot failed"); }
    finally { setAutopilotBusy(false); }
  }

  async function execute(body: any, label: string) {
    try {
      const { data, error } = await supabase.functions.invoke("instacart-ads-execute", { body });
      if (error) throw error;
      const d: any = data;
      if (!d?.ok) throw new Error(d?.partner_error ?? "Execute failed");
      toast.success(`${label} ✓${d?.partner_api ? " (Partner API)" : " (local-only — no API token)"}`);
      invalidateAll();
    } catch (e: any) { toast.error(e?.message ?? "Execute failed"); }
  }

  async function rejectRec(id: string) {
    const { error } = await supabase.from("ad_recommendations" as any)
      .update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Recommendation rejected"); invalidateAll(); }
  }

  async function executeRec(rec: any) {
    const p = rec.payload ?? {};
    let body: any = null;
    if (p.action === "raise_bid" || p.action === "lower_bid") {
      const kw = keywords.find((k: any) => k.keyword === p.keyword && k.match_type === (p.match_type ?? "broad"));
      if (!kw) { toast.error("Keyword not found locally"); return; }
      body = { action: "set_keyword_bid", keyword_id: kw.id, bid_cents: p.suggested_bid_cents, recommendation_id: rec.id };
    } else if (p.action === "pause") {
      const kw = keywords.find((k: any) => k.keyword === p.keyword && k.match_type === (p.match_type ?? "broad"));
      if (!kw) { toast.error("Keyword not found locally"); return; }
      body = { action: "pause_keyword", keyword_id: kw.id, recommendation_id: rec.id };
    } else if (p.action === "promote_search_term") {
      const st = searchTerms.find((s: any) => s.query === p.keyword);
      if (!st) { toast.error("Search term not found"); return; }
      body = { action: "promote_search_term", search_term_id: st.id, bid_cents: p.suggested_bid_cents ?? 50, match_type: p.match_type ?? "exact", recommendation_id: rec.id };
    } else { toast.error(`Action ${p.action} requires manual execution`); return; }
    await execute(body, `Recommendation: ${p.action}`);
  }

  return (
    <>
      <Seo noindex title="Kennel Instacart Ads" />
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
          <Button variant="outline" onClick={runApiSync} disabled={busy}>
            <RefreshCw className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} /> Sync from API
          </Button>
          <Button onClick={runRecommender} disabled={busy}>
            <Sparkles className="h-4 w-4 mr-2" /> Run AI recommender
          </Button>
        </div>
      </div>

      <InstacartCapabilitiesOutline />

      {/* Autopilot Command & Control */}
      <Card className="border-2 border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-sm uppercase tracking-brand flex items-center gap-2">
              <Bot className="h-4 w-4" /> Autopilot — Command & Control
              <Badge variant={cfg.enabled ? "default" : "secondary"} className="ml-2">
                {cfg.enabled ? "AUTONOMOUS" : "MANUAL"}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={runAutopilotNow} disabled={autopilotBusy}>
                {autopilotBusy ? <RefreshCw className="h-3 w-3 mr-2 animate-spin" /> : <Bot className="h-3 w-3 mr-2" />}
                Run autopilot now
              </Button>
              <Switch checked={cfg.enabled} onCheckedChange={(v) => setSetting("instacart_autopilot_enabled", v)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground uppercase tracking-brand">Min confidence</span>
              <span className="tabular-nums font-semibold">{(cfg.confMin * 100).toFixed(0)}%</span>
            </div>
            <Slider min={0.5} max={1} step={0.05} value={[cfg.confMin]}
              onValueChange={(v) => setSetting("instacart_autopilot_confidence_min", v[0])} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground uppercase tracking-brand">Max bid change</span>
              <span className="tabular-nums font-semibold">±{cfg.maxBidPct}%</span>
            </div>
            <Slider min={5} max={100} step={5} value={[cfg.maxBidPct]}
              onValueChange={(v) => setSetting("instacart_autopilot_max_bid_change_pct", v[0])} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground uppercase tracking-brand">Daily action cap</span>
              <span className="tabular-nums font-semibold">{cfg.dailyCap}/day</span>
            </div>
            <Input type="number" min={1} max={500} value={cfg.dailyCap}
              onChange={(e) => setSetting("instacart_autopilot_daily_action_cap", Number(e.target.value))} />
          </div>
          <p className="md:col-span-3 text-xs text-muted-foreground border-t border-border pt-3">
            Autopilot runs every 30 minutes. When enabled, it auto-executes pending AI recommendations
            whose confidence is at least the threshold above, capped by daily action count and bid-change percent.
            Flip the toggle off at any time to revert to fully manual control — pending recommendations stay queued.
          </p>
        </CardContent>
      </Card>

      <InstacartAutopilotHealth />

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
          <TabsTrigger value="recs">Recommendations ({recs.length})</TabsTrigger>
          <TabsTrigger value="log">Action log</TabsTrigger>
          <TabsTrigger value="ingest">Ingest CSV</TabsTrigger>
          <TabsTrigger value="rpm">RPM & Partnerships</TabsTrigger>
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
                    <th className="p-3">Actions</th>
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
                        <td className="p-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost">⋯</Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {c.status === "enabled" ? (
                                <DropdownMenuItem onClick={() => execute({ action: "pause_campaign", campaign_id: c.id }, "Paused campaign")}>
                                  <Pause className="h-3 w-3 mr-2" /> Pause campaign
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => execute({ action: "resume_campaign", campaign_id: c.id }, "Resumed campaign")}>
                                  <Play className="h-3 w-3 mr-2" /> Resume campaign
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => {
                                const v = prompt("New daily budget (USD)", (c.daily_budget_cents / 100).toString());
                                if (v) execute({ action: "set_campaign_budget", campaign_id: c.id, daily_budget_cents: Math.round(Number(v) * 100) }, `Budget → $${v}`);
                              }}>Set daily budget…</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                const k = prompt("Negative keyword to add"); if (!k) return;
                                execute({ action: "add_negative_keyword", campaign_id: c.id, keyword: k, match_type: "phrase" }, `Added negative "${k}"`);
                              }}>Add negative keyword…</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
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
                  <th className="p-3">Actions</th>
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
                        <td className="p-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost">⋯</Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => execute({ action: "set_keyword_bid", keyword_id: k.id, bid_cents: Math.round((k.bid_cents ?? 50) * 1.15) }, "Raised bid 15%")}>
                                <ArrowUp className="h-3 w-3 mr-2" /> Raise bid +15%
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => execute({ action: "set_keyword_bid", keyword_id: k.id, bid_cents: Math.max(1, Math.round((k.bid_cents ?? 50) * 0.85)) }, "Lowered bid 15%")}>
                                <ArrowDown className="h-3 w-3 mr-2" /> Lower bid −15%
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                const v = prompt("New bid (USD)", ((k.bid_cents ?? 50) / 100).toString());
                                if (v) execute({ action: "set_keyword_bid", keyword_id: k.id, bid_cents: Math.round(Number(v) * 100) }, `Bid → $${v}`);
                              }}>Set exact bid…</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {k.status === "paused" ? (
                                <DropdownMenuItem onClick={() => execute({ action: "resume_keyword", keyword_id: k.id }, "Resumed keyword")}>
                                  <Play className="h-3 w-3 mr-2" /> Resume
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => execute({ action: "pause_keyword", keyword_id: k.id }, "Paused keyword")}>
                                  <Pause className="h-3 w-3 mr-2" /> Pause
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
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
                  <th className="p-3">Actions</th>
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
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button size="sm" variant="ghost">⋯</Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => execute({ action: "promote_search_term", search_term_id: t.id, bid_cents: 75, match_type: "exact" }, `Promoted "${t.query}"`)}>
                              <ArrowUp className="h-3 w-3 mr-2" /> Promote to exact keyword
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="recs">
          <Card><CardContent className="p-0 overflow-x-auto">
            {recs.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">
                No pending recommendations. Click <em>Run AI recommender</em> to generate some.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted"><tr className="text-left">
                  <th className="p-3">Action</th><th className="p-3">Keyword</th>
                  <th className="p-3 text-right">Conf</th><th className="p-3 text-right">Bid Δ</th>
                  <th className="p-3 text-right">Est. impact</th><th className="p-3">Why</th>
                  <th className="p-3">Decide</th>
                </tr></thead>
                <tbody>
                  {recs.map((r: any) => {
                    const p = r.payload ?? {};
                    const conf = Number(r.confidence ?? 0);
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="p-3"><Badge>{p.action ?? "?"}</Badge></td>
                        <td className="p-3 font-medium">{p.keyword ?? "—"} <span className="text-xs text-muted-foreground">{p.match_type}</span></td>
                        <td className="p-3 text-right tabular-nums">{(conf * 100).toFixed(0)}%</td>
                        <td className="p-3 text-right tabular-nums text-xs">
                          {p.current_bid_cents ? `${dollars(p.current_bid_cents)} → ${dollars(p.suggested_bid_cents)}` : "—"}
                        </td>
                        <td className="p-3 text-right tabular-nums">{dollars(p.estimated_monthly_impact_cents ?? r.projected_impact_cents)}</td>
                        <td className="p-3 text-xs text-muted-foreground max-w-md">{r.summary ?? p.reason}</td>
                        <td className="p-3 flex gap-1">
                          <Button size="sm" variant="default" onClick={() => executeRec(r)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Execute
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => rejectRec(r.id)}>
                            <XCircle className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="log">
          <Card><CardContent className="p-0 overflow-x-auto">
            {log.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">No actions executed yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted"><tr className="text-left">
                  <th className="p-3">When</th><th className="p-3">Who</th>
                  <th className="p-3">Action</th><th className="p-3">Before → After</th><th className="p-3">Status</th>
                </tr></thead>
                <tbody>
                  {log.map((l: any) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="p-3 text-xs">{new Date(l.created_at).toLocaleString()}</td>
                      <td className="p-3"><Badge variant="outline">{l.executor ?? l.actor_kind}</Badge></td>
                      <td className="p-3 text-xs font-mono">{l.request_payload?.action ?? l.action}</td>
                      <td className="p-3 text-xs font-mono">
                        {JSON.stringify(l.before_value ?? {})} → {JSON.stringify(l.after_value ?? {})}
                      </td>
                      <td className="p-3">
                        {l.success ? <Badge>OK</Badge> : <Badge variant="destructive" title={l.error_message}>FAIL</Badge>}
                      </td>
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

        <TabsContent value="rpm">
          <InstacartPartnershipPlanner />
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
}