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

const EXPLORATION_FLOOR = 200;
const ORDER_WEIGHT = 8;

/**
 * Estimate each variant's probability of being the true best (highest
 * click+order reward rate) via a Monte Carlo Thompson Sampling simulation
 * over Beta posteriors. Matches the bandit logic in MerchHero.
 */
function winProbabilities(rows: Row[]): Record<string, number> {
  const SIMS = 4000;
  const wins: Record<string, number> = Object.fromEntries(rows.map((r) => [r.variant_id, 0]));
  const params = rows.map((r) => {
    const reward = r.clicks + ORDER_WEIGHT * r.orders;
    return {
      id: r.variant_id,
      alpha: Math.max(1, reward) + 1,
      beta: Math.max(0, r.impressions - reward) + 1,
    };
  });
  // Use Math.random-based Beta via two Gammas approximation; for display
  // purposes a lighter normal approximation is fine.
  const sampleBeta = (a: number, b: number) => {
    const mean = a / (a + b);
    const variance = (a * b) / ((a + b) ** 2 * (a + b + 1));
    const sd = Math.sqrt(variance);
    // Box-Muller
    const u1 = Math.random() || 1e-9;
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.min(1, Math.max(0, mean + sd * z));
  };
  for (let s = 0; s < SIMS; s++) {
    let bestIdx = 0;
    let best = -Infinity;
    params.forEach((p, i) => {
      const x = sampleBeta(p.alpha, p.beta);
      if (x > best) { best = x; bestIdx = i; }
    });
    wins[params[bestIdx].id] += 1;
  }
  return Object.fromEntries(Object.entries(wins).map(([k, v]) => [k, v / SIMS]));
}

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
            <OptimizerStatus rows={rows} />
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
                    <th className="px-4 py-3 text-right">P(best)</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const probs = winProbabilities(rows);
                    return rows.map((r) => {
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
                        <td className="px-4 py-3 text-right tabular-nums">{(probs[r.variant_id] * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  });
                  })()}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground mt-6">
              Attribution: a 90-day cookie (<code>rdw_hero_variant</code>) records the last hero a visitor saw or clicked.
              Shopify orders are credited to that variant when the order webhook fires (wire-up pending).
              CTR = clicks ÷ impressions. Conv. Rate = orders ÷ impressions. RPI = revenue per impression.
              P(best) = Thompson-sampled probability that a variant has the highest reward rate
              (reward = clicks + {ORDER_WEIGHT}× orders).
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

function OptimizerStatus({ rows }: { rows: Row[] }) {
  const minImpr = rows.length ? Math.min(...rows.map((r) => r.impressions)) : 0;
  const exploring = minImpr < EXPLORATION_FLOOR;
  return (
    <div className="border border-border p-4 mb-6 bg-muted/40">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs uppercase tracking-brand font-bold">Optimizer</span>
        <span
          className={`text-xs uppercase tracking-brand font-bold px-2 py-1 ${
            exploring ? "bg-foreground text-background" : "bg-primary text-primary-foreground"
          }`}
        >
          {exploring ? "Exploring" : "Optimizing"}
        </span>
        <span className="text-sm text-muted-foreground">
          {exploring
            ? `Round-robin until every variant reaches ${EXPLORATION_FLOOR} impressions (lowest: ${minImpr.toLocaleString()}).`
            : `Thompson Sampling bandit is live — higher-CTR variants are shown more often, with continuous exploration.`}
        </span>
      </div>
    </div>
  );
}