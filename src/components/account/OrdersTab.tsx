import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, Package, ShoppingBag } from "lucide-react";

const fmtCents = (c: number | null | undefined) =>
  `$${((c ?? 0) / 100).toFixed(2)}`;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const OrdersTab = ({ userId, email }: { userId: string; email?: string | null }) => {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["customer-orders", userId, email],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id, order_number, created_at, total_cents, wine_subtotal_cents, merch_subtotal_cents, payment_status, vinoshipper_status, merch_fulfillment_status, items:order_items(id, product_name, variant_name, quantity, unit_price_cents, line_total_cents, product_kind)"
        )
        .order("created_at", { ascending: false });
      // Match by user_id OR customer_email so legacy/guest orders are visible
      q = email
        ? q.or(`user_id.eq.${userId},customer_email.eq.${email}`)
        : q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 border border-border">
        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="font-bold text-foreground mb-2">No orders yet</h3>
        <p className="text-sm text-muted-foreground mb-4">
          When you place an order, it'll show up here.
        </p>
        <Button asChild>
          <Link to="/wines">Browse Wines</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((o) => {
        const status =
          o.payment_status === "paid"
            ? o.vinoshipper_status === "shipped" || o.merch_fulfillment_status === "shipped"
              ? "Shipped"
              : "Processing"
            : o.payment_status === "pending"
            ? "Pending"
            : o.payment_status;
        return (
          <div key={o.id} className="border border-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-muted/30">
              <div>
                <p className="text-sm font-bold text-foreground">
                  Order {o.order_number}
                </p>
                <p className="text-xs text-muted-foreground">
                  Placed {fmtDate(o.created_at)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">
                  {fmtCents(o.total_cents)}
                </p>
                <span className="text-[10px] uppercase tracking-brand font-bold text-muted-foreground">
                  {status}
                </span>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {(o.items ?? []).map((it: any) => (
                <li key={it.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ShoppingBag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {it.product_name}
                        {it.variant_name ? ` · ${it.variant_name}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Qty {it.quantity} · {fmtCents(it.unit_price_cents)} ea
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-mono text-foreground">
                    {fmtCents(it.line_total_cents)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};