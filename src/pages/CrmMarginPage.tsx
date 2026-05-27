import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingUp, DollarSign, Receipt, PieChart } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

type MarginRow = {
  order_id: string;
  order_number: string;
  created_at: string;
  payment_status: string;
  gross_cents: number;
  stripe_fee_cents: number;
  cogs_cents: number;
  gross_margin_cents: number;
  margin_pct: number | null;
};

type ItemRow = {
  order_id: string;
  product_kind: "wine" | "merch";
  partner_kind: string | null;
  partner_id: string | null;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price_cents: number;
  cost_cents: number | null;
};

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function CrmMarginPage() {
  const [orders, setOrders] = useState<MarginRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [wines, setWines] = useState<Array<{ id: string; title: string; price_cents: number; cost_cents: number | null }>>([]);
  const [merch, setMerch] = useState<Array<{ id: string; title: string; price_cents: number; cost_cents: number | null }>>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: i }, { data: w }, { data: m }] = await Promise.all([
        supabase.from("order_margin_v" as any).select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("order_items").select("order_id,product_kind,partner_kind,partner_id,product_name,product_sku,quantity,unit_price_cents,cost_cents").limit(2000),
        supabase.from("wine_products").select("id, title, price_cents, cost_cents").eq("is_active", true).order("title"),
        supabase.from("merch_products").select("id, title, price_cents, cost_cents").eq("is_active", true).order("title"),
      ]);
      setOrders((o as unknown as MarginRow[]) ?? []);
      setItems((i as unknown as ItemRow[]) ?? []);
      setWines((w as any) ?? []);
      setMerch((m as any) ?? []);
      setLoading(false);
    })();
  }, []);

  async function saveCost(table: "wine_products" | "merch_products", id: string, value: string) {
    const cents = value === "" ? null : Math.round(parseFloat(value) * 100);
    if (cents !== null && (Number.isNaN(cents) || cents < 0)) {
      toast.error("Invalid cost");
      return;
    }
    setSavingId(id);
    const { error } = await supabase.from(table).update({ cost_cents: cents }).eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error("Save failed");
      return;
    }
    toast.success("Cost saved");
    if (table === "wine_products") {
      setWines(ws => ws.map(w => w.id === id ? { ...w, cost_cents: cents } : w));
    } else {
      setMerch(ms => ms.map(p => p.id === id ? { ...p, cost_cents: cents } : p));
    }
  }

  const totals = useMemo(() => {
    const paid = orders.filter(o => o.payment_status === "paid");
    return {
      orderCount: paid.length,
      gross: paid.reduce((s, o) => s + (o.gross_cents ?? 0), 0),
      fees: paid.reduce((s, o) => s + (o.stripe_fee_cents ?? 0), 0),
      cogs: paid.reduce((s, o) => s + (o.cogs_cents ?? 0), 0),
      margin: paid.reduce((s, o) => s + (o.gross_margin_cents ?? 0), 0),
    };
  }, [orders]);

  const marginPct = totals.gross > 0 ? (totals.margin / totals.gross * 100).toFixed(1) : "—";

  const bySku = useMemo(() => {
    const map = new Map<string, { name: string; sku: string; kind: string; units: number; revenue: number; cogs: number }>();
    for (const it of items) {
      const key = `${it.product_kind}::${it.product_sku ?? it.product_name}`;
      const cur = map.get(key) ?? { name: it.product_name, sku: it.product_sku ?? "—", kind: it.product_kind, units: 0, revenue: 0, cogs: 0 };
      cur.units += it.quantity;
      cur.revenue += it.unit_price_cents * it.quantity;
      cur.cogs += (it.cost_cents ?? 0) * it.quantity;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => (b.revenue - b.cogs) - (a.revenue - a.cogs));
  }, [items]);

  const byPartner = useMemo(() => {
    const map = new Map<string, { partner: string; units: number; revenue: number; cogs: number }>();
    for (const it of items) {
      const key = `${it.partner_kind ?? "none"}::${it.partner_id ?? "—"}`;
      const cur = map.get(key) ?? { partner: `${it.partner_kind ?? "—"} / ${it.partner_id ?? "—"}`, units: 0, revenue: 0, cogs: 0 };
      cur.units += it.quantity;
      cur.revenue += it.unit_price_cents * it.quantity;
      cur.cogs += (it.cost_cents ?? 0) * it.quantity;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => (b.revenue - b.cogs) - (a.revenue - a.cogs));
  }, [items]);

  if (loading) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading margin data…</div>;
  }

  return (
    <>
      <Seo noindex title="Crm Margin" />
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Margin</h1>
        <p className="text-sm text-muted-foreground">Gross profit by order, SKU, and fulfillment partner. Updated on each paid order.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat icon={<Receipt className="h-4 w-4" />} label="Paid orders" value={String(totals.orderCount)} />
        <Stat icon={<DollarSign className="h-4 w-4" />} label="Gross revenue" value={fmt(totals.gross)} />
        <Stat icon={<DollarSign className="h-4 w-4" />} label="Stripe fees" value={fmt(totals.fees)} />
        <Stat icon={<PieChart className="h-4 w-4" />} label="COGS" value={fmt(totals.cogs)} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label={`Margin (${marginPct}%)`} value={fmt(totals.margin)} highlight />
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">By order</TabsTrigger>
          <TabsTrigger value="sku">By SKU</TabsTrigger>
          <TabsTrigger value="partner">By partner</TabsTrigger>
          <TabsTrigger value="costs">Set costs</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Stripe fee</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No orders yet</TableCell></TableRow>
                )}
                {orders.map(o => (
                  <TableRow key={o.order_id}>
                    <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                    <TableCell className="text-xs">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs capitalize">{o.payment_status}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(o.gross_cents ?? 0)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">−{fmt(o.stripe_fee_cents ?? 0)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">−{fmt(o.cogs_cents ?? 0)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmt(o.gross_margin_cents ?? 0)}</TableCell>
                    <TableCell className="text-right font-mono">{o.margin_pct != null ? `${o.margin_pct}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="sku">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySku.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No data yet</TableCell></TableRow>
                )}
                {bySku.map((r, i) => {
                  const m = r.revenue - r.cogs;
                  const pct = r.revenue > 0 ? (m / r.revenue * 100).toFixed(1) : "—";
                  return (
                    <TableRow key={i}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell className="capitalize text-xs">{r.kind}</TableCell>
                      <TableCell className="text-right">{r.units}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(r.revenue)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">−{fmt(r.cogs)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmt(m)}</TableCell>
                      <TableCell className="text-right font-mono">{pct}{pct !== "—" && "%"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="partner">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Partner cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byPartner.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No data yet</TableCell></TableRow>
                )}
                {byPartner.map((r, i) => {
                  const m = r.revenue - r.cogs;
                  const pct = r.revenue > 0 ? (m / r.revenue * 100).toFixed(1) : "—";
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.partner}</TableCell>
                      <TableCell className="text-right">{r.units}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(r.revenue)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">−{fmt(r.cogs)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmt(m)}</TableCell>
                      <TableCell className="text-right font-mono">{pct}{pct !== "—" && "%"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="costs">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CostEditor
              title="Wine cost per bottle"
              hint="Wholesale cost paid to the producer/Vinoshipper. Used as COGS for margin reporting."
              rows={wines}
              savingId={savingId}
              onSave={(id, v) => saveCost("wine_products", id, v)}
            />
            <CostEditor
              title="Merch cost (self-fulfilled)"
              hint="Used only when no dropship SKU mapping exists. Dropship items pull cost from dropship_skus automatically."
              rows={merch}
              savingId={savingId}
              onSave={(id, v) => saveCost("merch_products", id, v)}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
}

function CostEditor({
  title, hint, rows, savingId, onSave,
}: {
  title: string;
  hint: string;
  rows: Array<{ id: string; title: string; price_cents: number; cost_cents: number | null }>;
  savingId: string | null;
  onSave: (id: string, value: string) => void;
}) {
  return (
    <>
      <Seo noindex title="Crm Margin" />
    <Card className="overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </div>
      <div className="max-h-[600px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right w-40">Cost ($)</TableHead>
              <TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No products</TableCell></TableRow>
            )}
            {rows.map(r => {
              const m = r.cost_cents != null ? r.price_cents - r.cost_cents : null;
              const pct = m != null && r.price_cents > 0 ? `${(m / r.price_cents * 100).toFixed(0)}%` : "—";
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.title}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(r.price_cents)}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={r.cost_cents != null ? (r.cost_cents / 100).toFixed(2) : ""}
                      disabled={savingId === r.id}
                      onBlur={(e) => {
                        const cur = r.cost_cents != null ? (r.cost_cents / 100).toFixed(2) : "";
                        if (e.target.value !== cur) onSave(r.id, e.target.value);
                      }}
                      className="h-8 text-right text-sm"
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {m != null ? `${fmt(m)} (${pct})` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
    </>
  );
}

function Stat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <>
      <Seo noindex title="Crm Margin" />
    <Card className={`p-4 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-brand">{icon} {label}</div>
      <div className="text-2xl font-bold mt-1 font-mono">{value}</div>
    </Card>
    </>
  );
}