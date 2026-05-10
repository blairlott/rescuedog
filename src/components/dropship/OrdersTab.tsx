import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Order = {
  id: string;
  partner_id: string;
  vinoshipper_order_id: string | null;
  partner_order_id: string | null;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  shipping_address: any;
  tracking_number: string | null;
  cost_cents: number;
  subtotal_cents: number;
  created_at: string;
};

const STATUSES = ["new", "submitted", "in_production", "shipped", "delivered", "exception"];
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const statusVariant = (s: string): any =>
  s === "delivered" ? "default" : s === "exception" ? "destructive" : s === "shipped" ? "default" : "secondary";

export function OrdersTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["dropship_orders", filter],
    queryFn: async () => {
      let q = supabase.from("dropship_orders" as any).select("*").order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as Order[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Order> }) => {
      const { error } = await supabase.from("dropship_orders" as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dropship_orders"] });
      toast.success("Order updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{orders.length} order{orders.length !== 1 && "s"}</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : orders.length === 0 ? (
        <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No drop-ship orders yet. They appear here when Vinoshipper webhooks deliver one with a mapped SKU.
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>VS Order</TableHead><TableHead>Customer</TableHead>
            <TableHead>Status</TableHead><TableHead>Tracking</TableHead><TableHead>Cost</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="text-sm">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-sm font-mono">{o.vinoshipper_order_id || "—"}</TableCell>
                <TableCell className="text-sm">{o.customer_name || "—"}<div className="text-xs text-muted-foreground">{o.customer_email}</div></TableCell>
                <TableCell>
                  <Select value={o.status} onValueChange={(v) => update.mutate({ id: o.id, patch: { status: v } })}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm">{o.tracking_number || "—"}</TableCell>
                <TableCell>{dollars(o.cost_cents)}</TableCell>
                <TableCell><Button variant="ghost" size="sm" onClick={() => setActive(o)}>Open</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Order {active?.vinoshipper_order_id || active?.id.slice(0, 8)}</DialogTitle></DialogHeader>
          {active && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Customer:</span> {active.customer_name} · {active.customer_email}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusVariant(active.status)}>{active.status}</Badge></div>
              <div>
                <label className="text-xs text-muted-foreground">Tracking number</label>
                <Input
                  defaultValue={active.tracking_number || ""}
                  onBlur={(e) => e.target.value !== (active.tracking_number || "") && update.mutate({ id: active.id, patch: { tracking_number: e.target.value } })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Partner order ID</label>
                <Input
                  defaultValue={active.partner_order_id || ""}
                  onBlur={(e) => e.target.value !== (active.partner_order_id || "") && update.mutate({ id: active.id, patch: { partner_order_id: e.target.value } })}
                />
              </div>
              <div>
                <span className="text-muted-foreground">Ship to:</span>
                <pre className="bg-muted p-2 text-xs overflow-auto">{JSON.stringify(active.shipping_address, null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}