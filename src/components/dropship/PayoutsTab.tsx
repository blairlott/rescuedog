import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Payout = {
  id: string;
  partner_id: string;
  period_start: string;
  period_end: string;
  order_count: number;
  total_cost_cents: number;
  status: string;
  paid_at: string | null;
};

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export function PayoutsTab() {
  const qc = useQueryClient();

  const { data: partners = [] } = useQuery({
    queryKey: ["dropship_partners"],
    queryFn: async () => {
      const { data } = await supabase.from("dropship_partners" as any).select("id,name");
      return ((data || []) as unknown) as { id: string; name: string }[];
    },
  });

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ["dropship_payouts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dropship_payouts" as any).select("*").order("period_end", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Payout[];
    },
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dropship_payouts" as any).update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dropship_payouts"] });
      toast.success("Marked paid");
    },
  });

  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name || "—";

  const generateThisMonth = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const { data: orders } = await supabase
        .from("dropship_orders" as any)
        .select("partner_id,cost_cents")
        .gte("created_at", start)
        .lte("created_at", end + "T23:59:59");
      const by: Record<string, { count: number; total: number }> = {};
      ((orders || []) as any[]).forEach((o) => {
        if (!by[o.partner_id]) by[o.partner_id] = { count: 0, total: 0 };
        by[o.partner_id].count++;
        by[o.partner_id].total += o.cost_cents || 0;
      });
      for (const [partner_id, agg] of Object.entries(by)) {
        await supabase.from("dropship_payouts" as any).insert({
          partner_id, period_start: start, period_end: end,
          order_count: agg.count, total_cost_cents: agg.total, status: "pending",
        } as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dropship_payouts"] });
      toast.success("Payouts generated for this month");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{payouts.length} payout{payouts.length !== 1 && "s"}</p>
        <Button size="sm" onClick={() => generateThisMonth.mutate()} disabled={generateThisMonth.isPending}>Generate this month</Button>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : payouts.length === 0 ? (
        <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No payouts recorded.</div>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Partner</TableHead><TableHead>Period</TableHead><TableHead>Orders</TableHead>
            <TableHead>Owed</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {payouts.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{partnerName(p.partner_id)}</TableCell>
                <TableCell className="text-sm">{p.period_start} → {p.period_end}</TableCell>
                <TableCell>{p.order_count}</TableCell>
                <TableCell>{dollars(p.total_cost_cents)}</TableCell>
                <TableCell><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {p.status !== "paid" && <Button size="sm" variant="outline" onClick={() => markPaid.mutate(p.id)}>Mark paid</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}