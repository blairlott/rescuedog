import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Search, Radar, ChevronRight } from "lucide-react";

function Tile({ to, icon: Icon, label, value, hint, badge }: any) {
  return (
    <Link to={to} className="block border border-border bg-card p-5 hover:border-primary transition-colors" style={{ borderRadius: 0 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <div className="text-xs uppercase tracking-brand text-muted-foreground font-semibold">{label}</div>
        </div>
        {badge ? <span className="text-[10px] uppercase font-bold bg-red-600 text-white px-2 py-0.5">{badge}</span> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="text-2xl font-bold mt-2 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Link>
  );
}

export function AdCommandTiles() {
  const { data } = useQuery({
    queryKey: ["ad-command-tiles"],
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const [ic, kw, rd] = await Promise.all([
        supabase.from("ad_campaigns" as any).select("spend_mtd_cents,sales_mtd_cents").eq("platform_slug", "instacart"),
        supabase.from("ad_keywords" as any).select("platform_slug,spend_30d_cents,sales_30d_cents"),
        supabase.from("platform_radar_alerts" as any).select("id,severity").is("dismissed_at", null),
      ]);
      const icRows = (ic.data as any[]) ?? [];
      const icSpend = icRows.reduce((a, r) => a + (r.spend_mtd_cents || 0), 0);
      const icSales = icRows.reduce((a, r) => a + (r.sales_mtd_cents || 0), 0);
      const kwRows = (kw.data as any[]) ?? [];
      const platforms = new Set(kwRows.map((r) => r.platform_slug));
      const kwSpend = kwRows.reduce((a, r) => a + (r.spend_30d_cents || 0), 0);
      const alerts = (rd.data as any[]) ?? [];
      const high = alerts.filter((a) => a.severity === "high").length;
      return {
        icSpend, icSales,
        icRoas: icSpend > 0 ? icSales / icSpend : 0,
        kwCount: kwRows.length, kwPlatforms: platforms.size, kwSpend,
        alertsTotal: alerts.length, alertsHigh: high,
      };
    },
  });

  const d = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Tile
        to="/kennel/instacart-ads" icon={ShoppingCart} label="Instacart Ads"
        value={data ? `${d(data.icSpend)} MTD` : "—"}
        hint={data ? `${data.icRoas ? data.icRoas.toFixed(2) + "x ROAS" : "no spend yet"} · ${d(data.icSales)} sales` : "Connect Partner API or ingest CSV"}
      />
      <Tile
        to="/kennel/keywords" icon={Search} label="Keyword Optimizer"
        value={data ? `${data.kwCount} keywords` : "—"}
        hint={data ? `${data.kwPlatforms} platforms · ${d(data.kwSpend)} spend (30d)` : "Cross-platform opportunities"}
      />
      <Tile
        to="/kennel/platform-radar" icon={Radar} label="Platform Radar"
        value={data ? `${data.alertsTotal} open` : "—"}
        hint={data ? `${data.alertsHigh} high-priority alert${data.alertsHigh === 1 ? "" : "s"}` : "Auto-scans the ad-platform landscape"}
        badge={data && data.alertsHigh > 0 ? data.alertsHigh : null}
      />
    </div>
  );
}