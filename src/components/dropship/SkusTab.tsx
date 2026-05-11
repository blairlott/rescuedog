import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Download, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type FulfillmentMode = "vinoshipper_warehouse" | "printify" | "printful" | "gooten" | "partner_direct";

type Partner = { id: string; name: string; vendor_type: string; simulation_mode: boolean };

type Sku = {
  id: string;
  partner_id: string;
  sku: string;
  partner_sku: string | null;
  product_title: string;
  product_image_url: string | null;
  cost_cents: number;
  retail_cents: number;
  is_active: boolean;
  fulfillment_mode: FulfillmentMode;
  vinoshipper_product_id: string | null;
  vendor_product_id: string | null;
  vendor_variant_id: string | null;
  last_synced_at: string | null;
};

const FULFILLMENT_LABELS: Record<FulfillmentMode, string> = {
  vinoshipper_warehouse: "VS Warehouse",
  printify: "Printify",
  printful: "Printful",
  gooten: "Gooten",
  partner_direct: "Partner Direct",
};

const empty: Partial<Sku> = { sku: "", partner_sku: "", product_title: "", cost_cents: 0, retail_cents: 0, is_active: true, fulfillment_mode: "partner_direct" };
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export function SkusTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Sku>>(empty);
  const [importOpen, setImportOpen] = useState(false);
  const [importPartnerId, setImportPartnerId] = useState<string>("");
  const [importItems, setImportItems] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  const { data: partners = [] } = useQuery({
    queryKey: ["dropship_partners"],
    queryFn: async () => {
      const { data } = await supabase.from("dropship_partners" as any).select("id,name,vendor_type,simulation_mode").order("name");
      return ((data || []) as unknown) as Partner[];
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

  const partner = (id: string) => partners.find((p) => p.id === id);

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

  const syncToVS = useMutation({
    mutationFn: async (sku_id: string) => {
      const { data, error } = await supabase.functions.invoke("sync-to-vinoshipper", { body: { sku_id } });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["dropship_skus"] });
      toast.success(d?.simulated ? "Synced (simulated)" : "Synced to Vinoshipper");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const loadImport = async () => {
    if (!importPartnerId) return;
    setImportLoading(true);
    setImportItems([]);
    try {
      const { data, error } = await supabase.functions.invoke("printify-import-products", { body: { partner_id: importPartnerId } });
      if (error) throw error;
      setImportItems(data?.products || []);
      if (data?.simulated) toast.info("Showing simulated catalog (no Printify API key yet)");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImportLoading(false);
    }
  };

  const importVariant = useMutation({
    mutationFn: async ({ product, variant }: { product: any; variant: any }) => {
      const { error } = await supabase.from("dropship_skus" as any).insert({
        partner_id: importPartnerId,
        sku: variant.sku,
        partner_sku: variant.sku,
        product_title: `${product.title} — ${variant.title}`,
        product_image_url: product.image,
        cost_cents: variant.cost_cents || 0,
        retail_cents: variant.price_cents || 0,
        fulfillment_mode: partner(importPartnerId)?.vendor_type || "partner_direct",
        vendor_product_id: String(product.id),
        vendor_variant_id: String(variant.id),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dropship_skus"] });
      toast.success("Imported");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <p className="text-sm text-muted-foreground">{skus.length} SKU{skus.length !== 1 && "s"}</p>
        <div className="flex gap-2">
          <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setImportItems([]); setImportPartnerId(""); } }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={partners.length === 0}><Download className="h-4 w-4 mr-1" /> Import from Vendor</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Import Products from Vendor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Select value={importPartnerId} onValueChange={setImportPartnerId}>
                    <SelectTrigger><SelectValue placeholder="Choose partner" /></SelectTrigger>
                    <SelectContent>
                      {partners.filter((p) => ["printify", "printful", "gooten"].includes(p.vendor_type)).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.vendor_type}{p.simulation_mode ? " — sim" : ""})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={loadImport} disabled={!importPartnerId || importLoading}>{importLoading ? "Loading..." : "Load Catalog"}</Button>
                </div>
                {importItems.length > 0 && (
                  <div className="max-h-96 overflow-y-auto border border-border">
                    {importItems.map((p: any) => (
                      <div key={p.id} className="border-b border-border p-3">
                        <div className="flex items-center gap-3 mb-2">
                          {p.image && <img src={p.image} alt="" className="w-12 h-12 object-cover" />}
                          <div className="font-medium">{p.title}</div>
                        </div>
                        <div className="grid gap-1 ml-15">
                          {(p.variants || []).map((v: any) => (
                            <div key={v.id} className="flex items-center justify-between text-sm border border-border px-2 py-1">
                              <span>{v.title} • {v.sku} • cost {dollars(v.cost_cents || 0)} / retail {dollars(v.price_cents || 0)}</span>
                              <Button size="sm" variant="ghost" onClick={() => importVariant.mutate({ product: p, variant: v })} disabled={importVariant.isPending}>Import</Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDraft(empty); }}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={partners.length === 0}><Plus className="h-4 w-4 mr-1" /> New SKU</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{draft.id ? "Edit" : "New"} SKU</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <Select value={draft.partner_id || ""} onValueChange={(v) => {
                  const p = partner(v);
                  setDraft({ ...draft, partner_id: v, fulfillment_mode: (p?.vendor_type as FulfillmentMode) || "partner_direct" });
                }}>
                  <SelectTrigger><SelectValue placeholder="Drop-ship partner" /></SelectTrigger>
                  <SelectContent>{partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={draft.fulfillment_mode || "partner_direct"} onValueChange={(v) => setDraft({ ...draft, fulfillment_mode: v as FulfillmentMode })}>
                  <SelectTrigger><SelectValue placeholder="Fulfillment mode" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FULFILLMENT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Internal SKU (matches Vinoshipper)" value={draft.sku || ""} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
                <Input placeholder="Partner SKU" value={draft.partner_sku || ""} onChange={(e) => setDraft({ ...draft, partner_sku: e.target.value })} />
                <Input placeholder="Product title" value={draft.product_title || ""} onChange={(e) => setDraft({ ...draft, product_title: e.target.value })} />
                <Input placeholder="Image URL" value={draft.product_image_url || ""} onChange={(e) => setDraft({ ...draft, product_image_url: e.target.value })} />
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
      </div>
      {partners.length === 0 && (
        <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">Add a partner first before creating SKUs.</div>
      )}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : skus.length === 0 && partners.length > 0 ? (
        <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No SKUs mapped yet. Use "Import from Vendor" to bring in a POD catalog.</div>
      ) : skus.length > 0 && (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Partner</TableHead>
            <TableHead>Fulfillment</TableHead><TableHead>VS</TableHead>
            <TableHead>Cost</TableHead><TableHead>Retail</TableHead><TableHead>Margin</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {skus.map((s) => {
              const margin = s.retail_cents - s.cost_cents;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    {s.product_image_url && <img src={s.product_image_url} alt="" className="w-8 h-8 object-cover" />}
                    {s.product_title}
                  </TableCell>
                  <TableCell className="text-sm">{s.sku}{s.partner_sku ? <div className="text-xs text-muted-foreground">→ {s.partner_sku}</div> : null}</TableCell>
                  <TableCell className="text-sm">{partner(s.partner_id)?.name || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{FULFILLMENT_LABELS[s.fulfillment_mode] || s.fulfillment_mode}</Badge></TableCell>
                  <TableCell>
                    {s.vinoshipper_product_id ? (
                      <Badge variant="default" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />{s.vinoshipper_product_id.startsWith("vs_sim_") ? "Sim" : "Live"}</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => syncToVS.mutate(s.id)} disabled={syncToVS.isPending}>
                        <RefreshCw className="h-3 w-3 mr-1" /> Sync
                      </Button>
                    )}
                  </TableCell>
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
