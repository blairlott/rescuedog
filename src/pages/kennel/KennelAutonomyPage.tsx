import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Play, Check, X, ExternalLink, Loader2 } from "lucide-react";
import { MetaAutopilotHealth } from "@/components/kennel/MetaAutopilotHealth";

function StatusPill({ s }: { s: string }) {
  const tone: Record<string, string> = {
    pending: "bg-amber-500 text-black",
    approved: "bg-emerald-600 text-white",
    rejected: "bg-muted text-foreground",
    applied: "bg-primary text-primary-foreground",
    pushed: "bg-primary text-primary-foreground",
    paused: "bg-destructive text-destructive-foreground",
    dry_run: "bg-amber-500 text-black",
    skipped: "bg-muted text-foreground",
    error: "bg-destructive text-destructive-foreground",
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase ${tone[s] ?? "bg-muted"}`} style={{ borderRadius: 0 }}>
      {s}
    </span>
  );
}

function useInvoke(fn: string, label: string) {
  return useMutation({
    mutationFn: async (body?: any) => {
      const { data, error } = await supabase.functions.invoke(fn, { body: body ?? {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => toast({ title: `${label} ran`, description: JSON.stringify(d).slice(0, 200) }),
    onError: (e: any) => toast({ title: `${label} failed`, description: e.message, variant: "destructive" }),
  });
}

export default function KennelAutonomyPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("lookalike");

  // --- Data
  const audiences = useQuery({
    queryKey: ["meta_audiences"],
    queryFn: async () => (await supabase.from("meta_audiences").select("*").order("segment_name")).data ?? [],
  });
  const pauseRules = useQuery({
    queryKey: ["auto_pause_rules"],
    queryFn: async () => (await supabase.from("auto_pause_rules").select("*").order("rule_key")).data ?? [],
  });
  const pauseEvents = useQuery({
    queryKey: ["auto_pause_events"],
    queryFn: async () => (await supabase.from("auto_pause_events").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });
  const variants = useQuery({
    queryKey: ["ai_creative_variants"],
    queryFn: async () => (await supabase.from("ai_creative_variants").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });
  const seoRecs = useQuery({
    queryKey: ["seo_page_recommendations"],
    queryFn: async () => (await supabase.from("seo_page_recommendations").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  const runLAL = useInvoke("meta-lookalike-trigger", "Lookalike trigger");
  const runPause = useInvoke("auto-pause-sweep", "Auto-pause sweep");
  const runVariants = useInvoke("ai-creative-variants", "AI variant generation");
  const runSEO = useInvoke("seo-autopilot-sweep", "SEO autopilot");

  async function setVariantStatus(id: string, status: "approved" | "rejected") {
    const { error } = await supabase.from("ai_creative_variants").update({ status, approved_at: new Date().toISOString() }).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["ai_creative_variants"] });
  }
  async function setSeoStatus(id: string, status: "approved" | "rejected") {
    const { error } = await supabase.from("seo_page_recommendations").update({ status, approved_at: new Date().toISOString() }).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["seo_page_recommendations"] });
  }

  const feedUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/product-feed-meta?rail=all`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-brand">Autonomy</h1>
          <p className="text-sm text-muted-foreground">Phase 4 — Lookalikes, DPA feed, auto-pause, AI creatives, SEO autopilot.</p>
        </div>
      </header>

      <MetaAutopilotHealth />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap" style={{ borderRadius: 0 }}>
          <TabsTrigger value="lookalike">Lookalikes</TabsTrigger>
          <TabsTrigger value="feed">Product Feed</TabsTrigger>
          <TabsTrigger value="pause">Auto-Pause</TabsTrigger>
          <TabsTrigger value="creatives">AI Creatives</TabsTrigger>
          <TabsTrigger value="seo">SEO Autopilot</TabsTrigger>
        </TabsList>

        {/* LOOKALIKES */}
        <TabsContent value="lookalike" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Meta Lookalike triggers</CardTitle>
              <Button size="sm" onClick={() => runLAL.mutate({})} disabled={runLAL.isPending} style={{ borderRadius: 0 }}>
                {runLAL.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase border-b">
                    <tr><th className="text-left p-2">Segment</th><th className="text-left p-2">Members</th><th className="text-left p-2">Auto-LAL</th><th className="text-left p-2">Ratio</th><th className="text-left p-2">LAL ID</th></tr>
                  </thead>
                  <tbody>
                    {(audiences.data ?? []).map((a: any) => (
                      <tr key={a.id} className="border-b">
                        <td className="p-2 font-medium">{a.segment_name}</td>
                        <td className="p-2 tabular-nums">{a.member_count ?? "—"}</td>
                        <td className="p-2">{a.create_lal ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-muted-foreground" />}</td>
                        <td className="p-2 tabular-nums">{Math.round(Number(a.lal_ratio) * 100)}%</td>
                        <td className="p-2 font-mono text-xs">{a.meta_lookalike_id ?? <Badge variant="outline">none</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PRODUCT FEED */}
        <TabsContent value="feed" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Meta Catalog product feed</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Paste this URL into Meta Commerce Manager → Data Sources → Scheduled Feed (CSV, refresh hourly):</p>
              <code className="block p-2 bg-muted font-mono text-xs break-all" style={{ borderRadius: 0 }}>{feedUrl}</code>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" style={{ borderRadius: 0 }}>
                  <a href={feedUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1" /> Preview feed</a>
                </Button>
                <Button asChild size="sm" variant="outline" style={{ borderRadius: 0 }}>
                  <a href={`${feedUrl.replace("rail=all", "rail=wine")}`} target="_blank" rel="noopener noreferrer">Wine only</a>
                </Button>
                <Button asChild size="sm" variant="outline" style={{ borderRadius: 0 }}>
                  <a href={`${feedUrl.replace("rail=all", "rail=merch")}`} target="_blank" rel="noopener noreferrer">Merch only</a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Toggle <code>product_feed_meta_enabled</code> in app_settings to disable.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUTO-PAUSE */}
        <TabsContent value="pause" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Auto-pause rules</CardTitle>
              <Button size="sm" onClick={() => runPause.mutate({})} disabled={runPause.isPending} style={{ borderRadius: 0 }}>
                {runPause.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Sweep now
              </Button>
            </CardHeader>
            <CardContent>
              {(pauseRules.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No rules defined yet. Insert into <code>auto_pause_rules</code> to activate.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b">
                    <tr><th className="text-left p-2">Rule</th><th className="text-left p-2">Platform</th><th className="text-left p-2">Metric</th><th className="text-left p-2">Threshold</th><th className="text-left p-2">Window</th><th className="text-left p-2">Mode</th><th className="text-left p-2">Enabled</th></tr>
                  </thead>
                  <tbody>
                    {(pauseRules.data ?? []).map((r: any) => (
                      <tr key={r.id} className="border-b">
                        <td className="p-2 font-medium">{r.name}</td>
                        <td className="p-2 uppercase text-xs">{r.platform}</td>
                        <td className="p-2">{r.metric} {r.comparator} {r.threshold}</td>
                        <td className="p-2 tabular-nums">{r.threshold}</td>
                        <td className="p-2 tabular-nums">{r.window_days}d</td>
                        <td className="p-2">{r.dry_run ? <Badge variant="outline">Dry-run</Badge> : <Badge className="bg-destructive">Live</Badge>}</td>
                        <td className="p-2">{r.enabled ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-muted-foreground" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent evaluations</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b">
                    <tr><th className="text-left p-2">When</th><th className="text-left p-2">Platform</th><th className="text-left p-2">Entity</th><th className="text-left p-2">Metric</th><th className="text-left p-2">Spend</th><th className="text-left p-2">Action</th></tr>
                  </thead>
                  <tbody>
                    {(pauseEvents.data ?? []).map((e: any) => (
                      <tr key={e.id} className="border-b">
                        <td className="p-2 tabular-nums">{new Date(e.created_at).toLocaleString()}</td>
                        <td className="p-2 uppercase text-xs">{e.platform}</td>
                        <td className="p-2">{e.entity_name ?? e.entity_id} <span className="text-xs text-muted-foreground">({e.entity_type})</span></td>
                        <td className="p-2 tabular-nums">{e.metric_observed?.toFixed(2)}</td>
                        <td className="p-2 tabular-nums">${((e.spend_cents ?? 0) / 100).toFixed(2)}</td>
                        <td className="p-2"><StatusPill s={e.action} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI CREATIVES */}
        <TabsContent value="creatives" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>AI ad copy variants</CardTitle>
              <Button size="sm" onClick={() => runVariants.mutate({})} disabled={runVariants.isPending} style={{ borderRadius: 0 }}>
                {runVariants.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Generate now
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {(variants.data ?? []).map((v: any) => (
                <div key={v.id} className="border p-3 space-y-2" style={{ borderRadius: 0 }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">{v.product_handle} · seed: <em>{v.prompt_seed}</em></div>
                    <StatusPill s={v.status} />
                  </div>
                  <div className="font-bold">{v.headline}</div>
                  <div className="text-sm">{v.primary_text}</div>
                  <div className="text-xs text-muted-foreground">CTA: {v.cta}</div>
                  {v.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setVariantStatus(v.id, "approved")} style={{ borderRadius: 0 }}>
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setVariantStatus(v.id, "rejected")} style={{ borderRadius: 0 }}>
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {(variants.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No variants yet. Click "Generate now" to seed.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEO */}
        <TabsContent value="seo" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>SEO recommendations</CardTitle>
              <Button size="sm" onClick={() => runSEO.mutate({})} disabled={runSEO.isPending} style={{ borderRadius: 0 }}>
                {runSEO.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Scan now
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {(seoRecs.data ?? []).map((r: any) => (
                <div key={r.id} className="border p-3 space-y-2" style={{ borderRadius: 0 }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-xs">{r.url}</div>
                    <StatusPill s={r.status} />
                  </div>
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase">Current title</div>
                      <div className="line-clamp-2">{r.current_title ?? "—"}</div>
                      <div className="text-xs text-muted-foreground uppercase mt-2">Current meta</div>
                      <div className="line-clamp-3">{r.current_meta_desc ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase">Suggested title</div>
                      <div className="font-bold">{r.suggested_title ?? "—"}</div>
                      <div className="text-xs text-muted-foreground uppercase mt-2">Suggested meta</div>
                      <div>{r.suggested_meta_desc ?? "—"}</div>
                    </div>
                  </div>
                  {r.reason && <div className="text-xs text-muted-foreground italic">Reason: {r.reason}</div>}
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setSeoStatus(r.id, "approved")} style={{ borderRadius: 0 }}>
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSeoStatus(r.id, "rejected")} style={{ borderRadius: 0 }}>
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {(seoRecs.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No recommendations yet. Click "Scan now" to generate.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}