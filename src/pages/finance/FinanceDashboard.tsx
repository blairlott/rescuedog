import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, X, Calendar } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_TILE_KEYS, FINANCE_TILES, SOURCE_LABEL, TILE_BY_KEY, type FinanceTileSource } from "@/lib/financeTiles";
import { renderTile } from "@/components/finance/FinanceTiles";

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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
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

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Finance Dashboard</h1>
          <p className="text-sm text-muted-foreground">QuickBooks · Vinoshipper · Command Center</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={String(days)} onValueChange={onDaysChange}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map(r => <SelectItem key={r.days} value={String(r.days)}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add report</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {(Object.keys(grouped) as FinanceTileSource[]).map(src => (
                <div key={src}>
                  <DropdownMenuLabel>{SOURCE_LABEL[src]}</DropdownMenuLabel>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        {tiles.map(key => {
          const def = TILE_BY_KEY[key];
          if (!def) return null;
          const span = def.defaultSpan;
          const colClass = span === 12 ? "lg:col-span-12" : span === 6 ? "lg:col-span-6" : span === 4 ? "lg:col-span-4" : "lg:col-span-3";
          return (
            <div key={key} className={`border border-border bg-card p-4 ${colClass}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-brand text-muted-foreground">{SOURCE_LABEL[def.source]}</div>
                  <h3 className="font-bold">{def.title}</h3>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeTile(key)} title="Remove">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              {renderTile(key, days)}
            </div>
          );
        })}
        {tiles.length === 0 && (
          <div className="lg:col-span-12 border border-dashed border-border p-8 text-center text-muted-foreground">
            No tiles yet. Click "Add report" to compose your dashboard.
          </div>
        )}
      </div>
    </div>
  );
}