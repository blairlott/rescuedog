import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Activity, Flame, MousePointerClick, Play } from "lucide-react";
import { Seo } from "@/components/Seo";

interface Decision {
  id: string;
  run_at: string;
  decision_type: string;
  surface: string;
  rationale: string;
  evidence: Record<string, unknown>;
  status: string;
}

interface HeatBucket { x_bucket: number; y_bucket: number; hits: number }

const GRID = 40;

export default function KennelSiteIntelPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [path, setPath] = useState("/");
  const [heat, setHeat] = useState<HeatBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [topRage, setTopRage] = useState<any[]>([]);
  const [topSections, setTopSections] = useState<any[]>([]);

  const loadDecisions = async () => {
    const { data } = await supabase
      .from("site_intel_decisions" as any)
      .select("*")
      .order("run_at", { ascending: false })
      .limit(50);
    setDecisions((data as any) ?? []);
  };

  const loadHeatmap = async (p: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("site_intel_heatmap" as any, {
      _path: p, _event_type: "click", _grid: GRID,
    });
    if (error) toast.error(error.message);
    setHeat((data as any) ?? []);
    setLoading(false);
  };

  const loadSummaries = async () => {
    const { data: sections } = await supabase.rpc("site_intel_section_summary" as any, {});
    setTopSections(((sections as any) ?? []).slice(0, 12));
    const { data: rage } = await supabase
      .from("site_intel_events" as any)
      .select("path, selector, section_key")
      .eq("event_type", "rage_click")
      .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
      .limit(1000);
    const map = new Map<string, { path: string; selector: string; count: number }>();
    for (const r of (rage as any[]) ?? []) {
      const k = `${r.path}::${r.selector ?? ""}`;
      const cur = map.get(k) ?? { path: r.path, selector: r.selector ?? "", count: 0 };
      cur.count += 1; map.set(k, cur);
    }
    setTopRage(Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10));
  };

  useEffect(() => { loadDecisions(); loadHeatmap(path); loadSummaries(); }, []);

  const runNow = async (dry: boolean) => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("site-autopilot-nightly", {
        body: {},
        headers: { "x-trigger": "manual" },
      } as any);
      if (error) throw error;
      toast.success(`Autopilot ${dry ? "dry " : ""}run complete`);
      await loadDecisions();
    } catch (e: any) {
      toast.error(e.message || "Run failed — check cron settings (function requires KENNEL_INGEST_SECRET).");
    } finally {
      setRunning(false);
    }
  };

  const maxHits = heat.reduce((m, h) => Math.max(m, h.hits), 0) || 1;

  return (
    <>
      <Seo noindex title="Kennel Site Intel" />
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> Site Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Heatmaps, attention, and the autopilot's decisions.
          </p>
        </div>
        <Button onClick={() => runNow(false)} disabled={running}>
          <Play className="h-4 w-4 mr-2" /> {running ? "Running…" : "Run autopilot now"}
        </Button>
      </div>

      {/* Heatmap viewer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MousePointerClick className="h-5 w-5" /> Click heatmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              value={path} onChange={(e) => setPath(e.target.value)}
              placeholder="/"
              className="max-w-sm"
            />
            <Button onClick={() => loadHeatmap(path)} disabled={loading}>
              {loading ? "Loading…" : "Load"}
            </Button>
          </div>
          <div className="relative aspect-[16/10] bg-muted/30 border border-border rounded overflow-hidden">
            <svg viewBox={`0 0 ${GRID} ${GRID * 10 / 16}`} className="absolute inset-0 w-full h-full">
              {heat.map((h) => {
                const intensity = h.hits / maxHits;
                const hue = 240 - intensity * 240; // blue → red
                return (
                  <rect
                    key={`${h.x_bucket}-${h.y_bucket}`}
                    x={h.x_bucket} y={h.y_bucket * 10 / 16}
                    width={1.05} height={10 / 16 * 1.05}
                    fill={`hsl(${hue} 90% 50%)`} opacity={0.25 + intensity * 0.6}
                  />
                );
              })}
            </svg>
            {heat.length === 0 && (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                No click data yet for {path}. Visit the page and click around — events flush every 8s.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Rage clicks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-4 w-4 text-destructive" /> Rage hotspots (7d)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {topRage.length === 0 && <p className="text-muted-foreground">None detected.</p>}
            {topRage.map((r, i) => (
              <div key={i} className="flex justify-between items-start border-b border-border pb-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs truncate">{r.selector || "(unknown)"}</div>
                  <div className="text-xs text-muted-foreground">{r.path}</div>
                </div>
                <Badge variant="destructive">{r.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Section attention */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Section attention (14d)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {topSections.length === 0 && <p className="text-muted-foreground">No data.</p>}
            {topSections.map((s, i) => (
              <div key={i} className="flex justify-between items-start border-b border-border pb-2">
                <div className="min-w-0">
                  <div className="truncate">{s.section_key}</div>
                  <div className="text-xs text-muted-foreground">{s.path}</div>
                </div>
                <div className="text-right text-xs">
                  <div>{s.views} views</div>
                  <div className="text-muted-foreground">
                    {s.avg_dwell_ms ? `${Math.round(Number(s.avg_dwell_ms))}ms dwell` : "—"}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Autopilot decisions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent autopilot decisions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decisions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No decisions yet. The autopilot runs nightly and requires at least 200 exposures per variant.
            </p>
          )}
          {decisions.map((d) => (
            <div key={d.id} className="border border-border rounded p-3 text-sm">
              <div className="flex justify-between items-start mb-1">
                <div className="font-semibold">{d.decision_type.replace(/_/g, " ")} · {d.surface}</div>
                <Badge variant={d.status === "applied" ? "default" : "secondary"}>{d.status}</Badge>
              </div>
              <p className="text-muted-foreground mb-2">{d.rationale}</p>
              <pre className="text-xs bg-muted/40 p-2 rounded overflow-x-auto">
                {JSON.stringify(d.evidence, null, 2)}
              </pre>
              <div className="text-xs text-muted-foreground mt-1">{new Date(d.run_at).toLocaleString()}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
    </>
  );
}