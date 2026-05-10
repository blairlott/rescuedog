import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Sku = {
  id: string;
  partner_id: string;
  sku: string;
  partner_sku: string | null;
  product_title: string;
  cost_cents: number;
  retail_cents: number;
  is_active: boolean;
};

const empty: Partial<Sku> = { sku: "", partner_sku: "", product_title: "", cost_cents: 0, retail_cents: 0, is_active: true };
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export function SkusTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Sku>>(empty);

  const { data: partners = [] } = useQuery({
    queryKey: ["dropship_partners"],
    queryFn: async () => {
      const { data } = await supabase.from("dropship_partners" as any).select("id,name").order("name");
      return ((data || []) as unknown) as { id: string; name: string }[];
    },
  });

  const { data: skus = [], isLoading } = useQuery({
    queryKey: ["dropship_skus"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dropship_skus" as any).select("*").order("product_title");
      if (error) throw error;
      return (data || []) as unknown as Sku[];
    },
  });

  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name || "—";

  const save = useMutation({
    mutationFn: async (s: Partial<Sku>) => {
      const payload = { ...s, cost_cents: Number(s.cost_cents) || 0, retail_cents: Number(s.retail_cents) || 0 };
      if (s.id) {
        const { error } = await supabase.from("dropship_skus" as any).update(payload).eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dropship_skus" as any).insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dropship_skus"] });
      setOpen(false);
      setDraft(empty);
      toast.success("SKU saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dropship_skus" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dropship_skus"] });
      toast.success("Deleted");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{skus.length} SKU{skus.length !== 1 && "s"}</p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDraft(empty); }}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={partners.length === 0}><Plus className="h-4 w-4 mr-1" /> New SKU</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{draft.id ? "Edit" : "New"} SKU</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <Select value={draft.partner_id || ""} onValueChange={(v) => setDraft({ ...draft, partner_id: v })}>
                <SelectTrigger><SelectValue placeholder="Drop-ship partner" /></SelectTrigger>
                <SelectContent>{partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Internal SKU (matches Vinoshipper)" value={draft.sku || ""} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
              <Input placeholder="Partner SKU" value={draft.partner_sku || ""} onChange={(e) => setDraft({ ...draft, partner_sku: e.target.value })} />
              <Input placeholder="Product title" value={draft.product_title || ""} onChange={(e) => setDraft({ ...draft, product_title: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" placeholder="Cost (cents)" value={draft.cost_cents ?? 0} onChange={(e) => setDraft({ ...draft, cost_cents: Number(e.target.value) })} />
                <Input type="number" placeholder="Retail (cents)" value={draft.retail_cents ?? 0} onChange={(e) => setDraft({ ...draft, retail_cents: Number(e.target.value) })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate(draft)} disabled={!draft.partner_id || !draft.sku || !draft.product_title || save.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {partners.length === 0 && (
        <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">Add a partner first before creating SKUs.</div>
      )}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : skus.length === 0 && partners.length > 0 ? (
        <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No SKUs mapped yet.</div>
      ) : skus.length > 0 && (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Partner</TableHead>
            <TableHead>Cost</TableHead><TableHead>Retail</TableHead><TableHead>Margin</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {skus.map((s) => {
              const margin = s.retail_cents - s.cost_cents;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.product_title}</TableCell>
                  <TableCell className="text-sm">{s.sku}{s.partner_sku ? <div className="text-xs text-muted-foreground">→ {s.partner_sku}</div> : null}</TableCell>
                  <TableCell className="text-sm">{partnerName(s.partner_id)}</TableCell>
                  <TableCell>{dollars(s.cost_cents)}</TableCell>
                  <TableCell>{dollars(s.retail_cents)}</TableCell>
                  <TableCell><Badge variant={margin > 0 ? "default" : "secondary"}>{dollars(margin)}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setDraft(s); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete SKU?")) del.mutate(s.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}