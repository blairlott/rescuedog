import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "@/components/kennel/MetricCard";

type TxRow = {
  invoice: string;
  transaction_date: string | null;
  order_total: number | null;
  bottles: number | null;
  customer_id: string | null;
  customer_email: string | null;
  active_club_member: boolean | null;
  ship_to_state: string | null;
  discount_code: string | null;
  chain_status: string | null;
  order_type: string | null;
  club: string | null;
};
type ProdRow = {
  name: string; sku: string | null; value: number | null;
  quantity_sold: number | null; is_multipack: boolean;
};
type CartRow = { last_seen: string | null; cart_value: number | null; buyer_email: string | null };

const fmt$ = (n: number, d = 0) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })}`;

export function VinoshipperPanel({ rangeDays }: { rangeDays: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["vs-mirror", rangeDays],
    queryFn: async () => {
      const [txRes, prodRes, cartRes] = await Promise.all([
        supabase
          .from("vs_transactions" as any)
          .select("invoice,transaction_date,order_total,bottles,customer_id,customer_email,active_club_member,ship_to_state,discount_code,chain_status,order_type,club")
          .eq("transaction_type", "ORDER")
          .order("transaction_date", { ascending: false })
          .limit(10000),
        supabase
          .from("vs_products_lifetime" as any)
          .select("name,sku,value,quantity_sold,is_multipack")
          .order("value", { ascending: false })
          .limit(50),
        supabase
          .from("vs_abandoned_carts" as any)
          .select("last_seen,cart_value,buyer_email")
          .order("last_seen", { ascending: false })
          .limit(2000),
      ]);
      return {
        tx: ((txRes.data as any) ?? []) as TxRow[],
        prod: ((prodRes.data as any) ?? []) as ProdRow[],
        carts: ((cartRes.data as any) ?? []) as CartRow[],
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const m = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const ytdCutoff = new Date(now); ytdCutoff.setFullYear(ytdCutoff.getFullYear() - 1);
    const yoyCutoff = new Date(now); yoyCutoff.setFullYear(yoyCutoff.getFullYear() - 2);
    const carts90 = new Date(now); carts90.setDate(carts90.getDate() - 90);

    const active = data.tx.filter(t => t.chain_status !== "Cancelled");
    const period = active.filter(t => t.transaction_date && new Date(t.transaction_date) >= cutoff);
    const trailing12 = active.filter(t => t.transaction_date && new Date(t.transaction_date) >= ytdCutoff);
    const prior12 = active.filter(t => {
      if (!t.transaction_date) return false;
      const d = new Date(t.transaction_date);
      return d >= yoyCutoff && d < ytdCutoff;
    });

    const sum = (arr: TxRow[], k: keyof TxRow) =>
      arr.reduce((s, r) => s + Number(r[k] ?? 0), 0);

    const lifetimeRev = sum(active, "order_total");
    const lifetimeOrders = active.length;
    const periodRev = sum(period, "order_total");
    const periodOrders = period.length;
    const periodBottles = sum(period, "bottles");
    const periodAOV = periodOrders > 0 ? periodRev / periodOrders : 0;
    const t12Rev = sum(trailing12, "order_total");
    const p12Rev = sum(prior12, "order_total");
    const yoyPct = p12Rev > 0 ? ((t12Rev - p12Rev) / p12Rev) * 100 : null;

    // Repeat rate (lifetime): customers with >1 order
    const byCust = new Map<string, number>();
    for (const t of active) {
      const k = t.customer_id || t.customer_email;
      if (!k) continue;
      byCust.set(k, (byCust.get(k) ?? 0) + 1);
    }
    const totalCust = byCust.size;
    const repeatCust = Array.from(byCust.values()).filter(v => v > 1).length;
    const repeatRate = totalCust > 0 ? (repeatCust / totalCust) * 100 : 0;

    // Active club (orders flagged active in last 90d → distinct customers)
    const clubRecent = new Set(
      active.filter(t => t.active_club_member && t.transaction_date && new Date(t.transaction_date) >= carts90)
        .map(t => t.customer_id || t.customer_email)
        .filter(Boolean) as string[]
    );

    // Top states (period)
    const stateMap = new Map<string, { rev: number; orders: number }>();
    for (const t of period) {
      const s = (t.ship_to_state || "—").toUpperCase();
      const cur = stateMap.get(s) ?? { rev: 0, orders: 0 };
      cur.rev += Number(t.order_total ?? 0); cur.orders += 1;
      stateMap.set(s, cur);
    }
    const topStates = Array.from(stateMap.entries())
      .sort((a, b) => b[1].rev - a[1].rev).slice(0, 5);

    // Top SKUs lifetime (Products mirror)
    const topSkus = data.prod.filter(p => !p.is_multipack).slice(0, 10);

    // Discount codes (period)
    const codeMap = new Map<string, { rev: number; orders: number }>();
    for (const t of period) {
      const c = t.discount_code?.trim();
      if (!c) continue;
      const cur = codeMap.get(c) ?? { rev: 0, orders: 0 };
      cur.rev += Number(t.order_total ?? 0); cur.orders += 1;
      codeMap.set(c, cur);
    }
    const topCodes = Array.from(codeMap.entries())
      .sort((a, b) => b[1].rev - a[1].rev).slice(0, 5);

    // Cancellation rate (period — all tx including cancelled)
    const periodAll = data.tx.filter(t => t.transaction_date && new Date(t.transaction_date) >= cutoff);
    const cancelled = periodAll.filter(t => t.chain_status === "Cancelled").length;
    const cancelRate = periodAll.length > 0 ? (cancelled / periodAll.length) * 100 : 0;

    // Abandoned carts (90d)
    const carts = data.carts.filter(c => c.last_seen && new Date(c.last_seen) >= carts90);
    const cartValue = carts.reduce((s, c) => s + Number(c.cart_value ?? 0), 0);

    return {
      lifetimeRev, lifetimeOrders, periodRev, periodOrders, periodBottles, periodAOV,
      yoyPct, repeatRate, totalCust, repeatCust, activeClub: clubRecent.size,
      topStates, topSkus, topCodes, cancelRate, carts: carts.length, cartValue,
    };
  }, [data, rangeDays]);

  if (isLoading || !m) {
    return <div className="text-sm text-muted-foreground">Loading Vinoshipper…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label={`Revenue (${rangeDays}d)`} value={fmt$(m.periodRev)} hint={`${m.periodOrders.toLocaleString()} orders · AOV ${fmt$(m.periodAOV)}`} />
        <MetricCard label="Lifetime Revenue" value={fmt$(m.lifetimeRev)} hint={`${m.lifetimeOrders.toLocaleString()} orders since 2019`} />
        <MetricCard label="YoY (trailing 12mo)" value={m.yoyPct === null ? "—" : `${m.yoyPct >= 0 ? "+" : ""}${m.yoyPct.toFixed(1)}%`} hint="vs prior 12 months" />
        <MetricCard label="Repeat Rate" value={`${m.repeatRate.toFixed(1)}%`} hint={`${m.repeatCust.toLocaleString()} of ${m.totalCust.toLocaleString()} customers`} />
        <MetricCard label="Active Club (90d)" value={m.activeClub.toLocaleString()} hint="Distinct club members ordered" />
        <MetricCard label={`Bottles (${rangeDays}d)`} value={Math.round(m.periodBottles).toLocaleString()} hint="Units sold" />
        <MetricCard label={`Cancellations (${rangeDays}d)`} value={`${m.cancelRate.toFixed(1)}%`} hint="Of all orders in period" />
        <MetricCard label="Abandoned Carts (90d)" value={m.carts.toLocaleString()} hint={`${fmt$(m.cartValue)} cart value`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
          <h3 className="text-xs uppercase tracking-brand font-bold text-foreground mb-3">Top SKUs (lifetime)</h3>
          <table className="w-full text-xs">
            <tbody>
              {m.topSkus.map(p => (
                <tr key={`${p.sku}-${p.name}`} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-2 text-foreground truncate max-w-[200px]" title={p.name}>{p.name}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{(p.quantity_sold ?? 0).toLocaleString()}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums font-bold text-foreground">{fmt$(Number(p.value ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
          <h3 className="text-xs uppercase tracking-brand font-bold text-foreground mb-3">Top states ({rangeDays}d)</h3>
          {m.topStates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No orders in period.</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {m.topStates.map(([state, v]) => (
                  <tr key={state} className="border-b border-border last:border-0">
                    <td className="py-1.5 text-foreground font-bold">{state}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{v.orders} ord</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums font-bold text-foreground">{fmt$(v.rev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
          <h3 className="text-xs uppercase tracking-brand font-bold text-foreground mb-3">Discount codes ({rangeDays}d)</h3>
          {m.topCodes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No codes used in period.</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {m.topCodes.map(([code, v]) => (
                  <tr key={code} className="border-b border-border last:border-0">
                    <td className="py-1.5 text-foreground font-bold uppercase">{code}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{v.orders} ord</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums font-bold text-foreground">{fmt$(v.rev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}