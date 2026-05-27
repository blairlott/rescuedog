import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type VendorType = "vinoshipper_warehouse" | "printify" | "printful" | "gooten" | "partner_direct";

type Partner = {
  id: string;
  name: string;
  slug: string;
  contact_email: string | null;
  api_base_url: string | null;
  payout_terms: string | null;
  status: string;
  notify_on_new_order: boolean;
  vendor_type: VendorType;
  vendor_credentials: Record<string, any>;
  simulation_mode: boolean;
};

const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  vinoshipper_warehouse: "Vinoshipper Warehouse",
  printify: "Printify (POD)",
  printful: "Printful (POD)",
  gooten: "Gooten (POD)",
  partner_direct: "Partner Direct (manual PO)",
};

const empty: Partial<Partner> = {
  name: "", slug: "", contact_email: "", api_base_url: "", payout_terms: "Net 30",
  status: "active", notify_on_new_order: true, vendor_type: "partner_direct",
  vendor_credentials: {}, simulation_mode: true,
};

export function PartnersTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Partner>>(empty);

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["dropship_partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dropship_partners" as any)
        .select("id, name, slug, contact_email, contact_phone, api_base_url, api_key_secret_name, payout_terms, status, notify_on_new_order, vendor_type, simulation_mode, fulfills_from_us, notes, last_health_check_at, last_health_status, created_at, updated_at")
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as Partner[];
    },
  });

  const save = useMutation({
    mutationFn: async (p: Partial<Partner>) => {
      const payload = { ...p, vendor_credentials: p.vendor_credentials || {} };
      if (p.id) {
        const { error } = await supabase.from("dropship_partners" as any).update(payload).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dropship_partners" as any).insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dropship_partners"] });
      setOpen(false);
      setDraft(empty);
      toast.success("Partner saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dropship_partners" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dropship_partners"] });
      toast.success("Partner deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCred = (key: string, val: string) =>
    setDraft({ ...draft, vendor_credentials: { ...(draft.vendor_credentials || {}), [key]: val } });

  const credFields = (vt: VendorType | undefined) => {
    switch (vt) {
      case "printify":
      case "printful":
      case "gooten":
        return [
          { key: "shop_id", label: "Shop ID" },
          { key: "api_key_note", label: "API key (set as Lovable secret, e.g. PRINTIFY_API_KEY)" },
        ];
      case "vinoshipper_warehouse":
        return [{ key: "warehouse_code", label: "Warehouse code (optional)" }];
      default:
        return [{ key: "po_format", label: "PO format preference (email, PDF, etc.)" }];
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{partners.length} partner{partners.length !== 1 && "s"}</p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDraft(empty); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setDraft(empty)}><Plus className="h-4 w-4 mr-1" /> New Partner</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{draft.id ? "Edit" : "New"} Partner</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <Input placeholder="Name (e.g. Printify Main)" value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <Input placeholder="Slug (e.g. printify-main)" value={draft.slug || ""} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Vendor Type</Label>
                <Select value={draft.vendor_type || "partner_direct"} onValueChange={(v) => setDraft({ ...draft, vendor_type: v as VendorType, vendor_credentials: {} })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(VENDOR_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input placeholder="Contact email" value={draft.contact_email || ""} onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })} />
              <Input placeholder="Payout terms (e.g. Net 30)" value={draft.payout_terms || ""} onChange={(e) => setDraft({ ...draft, payout_terms: e.target.value })} />
              <div className="border border-border p-3 space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Vendor Credentials</Label>
                {credFields(draft.vendor_type as VendorType).map((f) => (
                  <Input key={f.key} placeholder={f.label} value={(draft.vendor_credentials as any)?.[f.key] || ""} onChange={(e) => updateCred(f.key, e.target.value)} />
                ))}
              </div>
              <div className="flex items-center justify-between border border-border p-3">
                <div>
                  <Label className="font-medium">Simulation mode</Label>
                  <p className="text-xs text-muted-foreground">Mock vendor API calls. Disable when real API keys are configured (target: May 18+).</p>
                </div>
                <Switch checked={draft.simulation_mode ?? true} onCheckedChange={(c) => setDraft({ ...draft, simulation_mode: c })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate(draft)} disabled={!draft.name || !draft.slug || save.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : partners.length === 0 ? (
        <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No drop-ship partners yet. Add one to start routing merch orders.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}<div className="text-xs text-muted-foreground">{p.slug}</div></TableCell>
                <TableCell><Badge variant="outline">{VENDOR_TYPE_LABELS[p.vendor_type] || p.vendor_type}</Badge></TableCell>
                <TableCell className="text-sm">{p.contact_email || "—"}</TableCell>
                <TableCell>{p.simulation_mode ? <Badge variant="secondary">Simulated</Badge> : <Badge>Live</Badge>}</TableCell>
                <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setDraft(p); setOpen(true); }} aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete ${p.name}?`)) del.mutate(p.id); }} aria-label={`Delete ${p.name}`}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
