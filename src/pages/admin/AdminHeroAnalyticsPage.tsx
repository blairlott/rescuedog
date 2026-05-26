import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { HERO_VARIANTS } from "@/components/merch/MerchHero";
import { Loader2 } from "lucide-react";

type Row = {
  variant_id: string;
  impressions: number;
  clicks: number;
  orders: number;
  revenue: number;
};

const RANGES = [
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
  { id: "all", label: "All time" },
];

function aggregate(events: Array<{ variant_id: string; event_type: string; order_value: number | null }>): Row[] {
  const map = new Map<string, Row>();
  for (const v of HERO_VARIANTS) {
    map.set(v.id, { variant_id: v.id, impressions: 0, clicks: 0, orders: 0, revenue: 0 });
  }
  for (const e of events) {
    const row = map.get(e.variant_id) ?? { variant_id: e.variant_id, impressions: 0, clicks: 0, orders: 0, revenue: 0 };
    if (e.event_type === "impression") row.impressions += 1;
    else if (e.event_type === "click") row.clicks += 1;
    else if (e.event_type === "order") {
      row.orders += 1;
      row.revenue += Number(e.order_value || 0);
    }
    map.set(e.variant_id, row);
  }
  return Array.from(map.values());
}

const pct = (num: number, den: number) => (den > 0 ? ((num / den) * 100).toFixed(2) + "%" : "—");

export default function AdminHeroAnalyticsPage() {
  const [range, setRange] = useState("30");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let q = supabase.from("hero_events").select("variant_id,event_type,order_value");
      if (range !== "all") {
        const since = new Date(Date.now() - parseInt(range, 10) * 86400 * 1000).toISOString();
        q = q.gte("created_at", since);
      }
      const { data, error } = await q.limit(50000);
      if (cancelled) return;
      if (error) {
        console.error(error);
        setRows([]);
      } else {
        setRows(aggregate((data || []) as Array<{ variant_id: string; event_type: string; order_value: number | null }>));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.impressions += r.impressions;
      acc.clicks += r.clicks;
      acc.orders += r.orders;
      acc.revenue += r.revenue;
      return acc;
    },
    { impressions: 0, clicks: 0, orders: 0, revenue: 0 },
  );

  return (
    <div className="min-h-dvh flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold uppercase tracking-brand">Merch Hero Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Per-variant impressions, SHOP MERCH clicks, and attributed Shopify orders.
            </p>
          </div>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="border border-border bg-background px-3 py-2 text-sm uppercase tracking-brand font-bold"
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Stat label="Impressions" value={totals.impressions.toLocaleString()} />
              <Stat label="Clicks" value={totals.clicks.toLocaleString()} />
              <Stat label="CTR" value={pct(totals.clicks, totals.impressions)} />
              <Stat label="Attributed Orders" value={totals.orders.toLocaleString()} sub={`$${totals.revenue.toFixed(2)} revenue`} />
            </div>

            <div className="overflow-x-auto border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left uppercase tracking-brand font-bold text-xs">
                    <th className="px-4 py-3">Variant</th>
                    <th className="px-4 py-3 text-right">Impressions</th>
                    <th className="px-4 py-3 text-right">Clicks</th>
                    <th className="px-4 py-3 text-right">CTR</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3 text-right">Conv. Rate</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">RPI</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const meta = HERO_VARIANTS.find((v) => v.id === r.variant_id);
                    const rpi = r.impressions > 0 ? r.revenue / r.impressions : 0;
                    return (
                      <tr key={r.variant_id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {meta && (
                              <img src={meta.jpg} alt="" className="w-14 h-9 object-cover" />
                            )}
                            <div>
                              <div className="font-semibold">{r.variant_id}</div>
                              {meta && (
                                <div className="text-xs text-muted-foreground line-clamp-1">{meta.eyebrow}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.impressions.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{pct(r.clicks, r.impressions)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.orders.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{pct(r.orders, r.impressions)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">${r.revenue.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">${rpi.toFixed(3)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground mt-6">
              Attribution: a 90-day cookie (<code>rdw_hero_variant</code>) records the last hero a visitor saw or clicked.
              Shopify orders are credited to that variant when the order webhook fires (wire-up pending).
              CTR = clicks ÷ impressions. Conv. Rate = orders ÷ impressions. RPI = revenue per impression.
            </p>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-border p-4">
      <div className="text-xs uppercase tracking-brand font-bold text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}