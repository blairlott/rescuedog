import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, X, Calendar, BookOpen, Wine, Activity, Sparkles, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_TILE_KEYS, FINANCE_TILES, SOURCE_LABEL, TILE_BY_KEY, type FinanceTileSource } from "@/lib/financeTiles";
import { renderTile } from "@/components/finance/FinanceTiles";
import { FeatureRequestBox } from "@/components/admin/FeatureRequestBox";
import { QuickBooksPanel } from "@/components/finance/QuickBooksPanel";
import { TileInsightStrip } from "@/components/finance/InsightStrip";
import { InsightsDrawer } from "@/components/finance/InsightsDrawer";
import { useCfoInsights, useGenerateInsights } from "@/hooks/finance/useCfoInsights";

const RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last 12 months", days: 365 },
];

export default function FinanceDashboard() {
  const qc = useQueryClient();
  const [tiles, setTiles] = useState<string[]>(DEFAULT_TILE_KEYS);
  const [days, setDays] = useState<number>(90);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const { data: openInsights = [] } = useCfoInsights("open");
  const generate = useGenerateInsights();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      setUserId(u?.id ?? null);
      setUserEmail(u?.email ?? null);
      if (u?.id) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", u.id).maybeSingle();
        setUserName((p as any)?.full_name ?? null);
      }
    });
  }, []);

  // Load saved layout
  useQuery({
    queryKey: ["cfo_layout", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cfo_dashboard_layouts" as any)
        .select("tiles, date_range_days")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const t = (data as any).tiles;
        if (Array.isArray(t) && t.length) setTiles(t.filter((k: string) => TILE_BY_KEY[k]));
        const d = (data as any).date_range_days;
        if (typeof d === "number" && d > 0) setDays(d);
      }
      return data;
    },
  });

  const persist = async (nextTiles: string[], nextDays: number) => {
    if (!userId) return;
    await supabase.from("cfo_dashboard_layouts" as any).upsert({
      user_id: userId, tiles: nextTiles, date_range_days: nextDays, updated_at: new Date().toISOString(),
    });
    qc.invalidateQueries({ queryKey: ["cfo_layout", userId] });
  };

  const addTile = (key: string) => {
    if (tiles.includes(key)) { toast.info("Already on dashboard"); return; }
    const next = [...tiles, key];
    setTiles(next); persist(next, days);
  };
  const removeTile = (key: string) => {
    const next = tiles.filter(k => k !== key);
    setTiles(next); persist(next, days);
  };
  const onDaysChange = (v: string) => {
    const n = Number(v);
    setDays(n); persist(tiles, n);
  };

  const grouped = useMemo(() => {
    const g: Record<FinanceTileSource, typeof FINANCE_TILES> = { quickbooks: [], vinoshipper: [], command_center: [] };
    for (const t of FINANCE_TILES) g[t.source].push(t);
    return g;
  }, []);

  const SOURCE_META: Record<FinanceTileSource, { icon: typeof BookOpen; chip: string }> = {
    quickbooks: { icon: BookOpen, chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    vinoshipper: { icon: Wine, chip: "bg-primary/10 text-primary" },
    command_center: { icon: Activity, chip: "bg-foreground/10 text-foreground" },
  };

  const sections: FinanceTileSource[] = ["quickbooks", "vinoshipper", "command_center"];
  const tilesBySource = sections.reduce<Record<FinanceTileSource, string[]>>((acc, src) => {
    acc[src] = tiles.filter(k => TILE_BY_KEY[k]?.source === src);
    return acc;
  }, { quickbooks: [], vinoshipper: [], command_center: [] });

  return (
    <div className="finance-workspace px-6 py-5 space-y-6 max-w-[1700px] mx-auto">
      {/* SAP-style sticky toolbar */}
      <div className="sticky top-14 z-20 -mx-6 px-6 py-3 bg-card border-b border-border flex flex-wrap items-center gap-2">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground">Workspace</span>
          <h1 className="text-base font-bold">Overview</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => qc.invalidateQueries()}
            title="Refresh all tiles"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            variant={openInsights.length ? "default" : "outline"}
            className="h-8 gap-1.5 relative"
            onClick={() => setInsightsOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Insights
            {openInsights.length > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 px-1 items-center justify-center text-[10px] font-bold bg-background text-foreground">
                {openInsights.length}
              </span>
            )}
          </Button>
          <div className="flex items-center gap-2 h-8 px-2 border border-border bg-card">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={String(days)} onValueChange={onDaysChange}>
              <SelectTrigger className="w-36 h-6 border-0 px-0 focus:ring-0 shadow-none text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map(r => <SelectItem key={r.days} value={String(r.days)}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8"><Plus className="h-3.5 w-3.5 mr-1" /> Add report</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              {(Object.keys(grouped) as FinanceTileSource[]).map(src => (
                <div key={src}>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-brand">{SOURCE_LABEL[src]}</DropdownMenuLabel>
                  {grouped[src].map(t => (
                    <DropdownMenuItem
                      key={t.key}
                      disabled={tiles.includes(t.key)}
                      onSelect={() => addTile(t.key)}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {tiles.length === 0 && (
        <div className="border border-dashed border-border bg-card p-12 text-center">
          <div className="text-sm font-semibold">Your dashboard is empty</div>
          <p className="text-sm text-muted-foreground mt-1">Click "Add report" to pull in KPIs from QuickBooks, Vinoshipper, or the Command Center.</p>
        </div>
      )}

      {/* Sectioned tile groups */}
      {sections.map(src => {
        const keys = tilesBySource[src];
        if (!keys.length) return null;
        const meta = SOURCE_META[src];
        const SrcIcon = meta.icon;
        return (
          <section key={src} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={`h-7 w-7 flex items-center justify-center ${meta.chip}`}>
                <SrcIcon className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-bold uppercase tracking-brand">{SOURCE_LABEL[src]}</h2>
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-brand text-muted-foreground">{keys.length} {keys.length === 1 ? "tile" : "tiles"}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3">
              {keys.map(key => {
                const def = TILE_BY_KEY[key];
                if (!def) return null;
                const span = def.defaultSpan;
                const colClass = span === 12 ? "lg:col-span-12" : span === 6 ? "lg:col-span-6" : span === 4 ? "lg:col-span-4" : "lg:col-span-3";
                return (
                  <div
                    key={key}
                    className={`group border border-border bg-card p-4 hover:border-foreground/40 transition-colors flex flex-col ${colClass}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0">
                        <div className={`inline-block px-1.5 py-0.5 text-[9px] uppercase tracking-brand mb-1 ${meta.chip}`}>{SOURCE_LABEL[def.source]}</div>
                        <h3 className="font-bold leading-tight truncate">{def.title}</h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeTile(key)}
                        title="Remove tile"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex-1">{renderTile(key, days)}</div>
                    <TileInsightStrip tileKey={key} onOpen={() => setInsightsOpen(true)} />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {userId && (
        <FeatureRequestBox
          userId={userId}
          userEmail={userEmail}
          userName={userName}
          priority="high"
          defaultArea="Finance"
          title="Send a request to the owner"
          description="Submit a feature request, fix, or data ask. CFO requests are flagged HIGH PRIORITY in the owner's inbox."
        />
      )}

      <QuickBooksPanel days={days} />
      <InsightsDrawer open={insightsOpen} onOpenChange={setInsightsOpen} days={days} />
    </div>
  );
}