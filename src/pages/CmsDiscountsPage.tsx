import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCmsAuth } from "@/hooks/useCmsAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, RefreshCw, Trash2, Loader2 } from "lucide-react";

type Code = {
  id: string;
  code: string;
  description: string | null;
  type: "percent" | "fixed" | "shipping";
  value: number;
  scope: "sitewide" | "wine" | "merch" | "sku_list" | "collection";
  tier: "public" | "club_member" | "ambassador" | "vip" | "staff";
  min_subtotal_cents: number;
  ends_at: string | null;
  usage_limit_total: number | null;
  usage_limit_per_customer: number | null;
  usage_count: number;
  active: boolean;
  shopify_mirror_status: string | null;
  shopify_mirror_error: string | null;
  vs_mirror_status: string | null;
  vs_mirror_error: string | null;
};

const empty = {
  code: "",
  description: "",
  type: "percent" as const,
  value: 10,
  scope: "sitewide" as const,
  tier: "public" as const,
  min_subtotal_cents: 0,
  ends_at: "",
  usage_limit_total: "",
  usage_limit_per_customer: 1,
  active: true,
};

export default function CmsDiscountsPage() {
  const nav = useNavigate();
  const { user, loading } = useCmsAuth();
  const { toast } = useToast();
  const [codes, setCodes] = useState<Code[]>([]);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);

  useEffect(() => {
    if (!loading && !user) nav("/cms/login");
  }, [user, loading, nav]);

  const refresh = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("discount-admin", { body: { action: "list" } });
    setBusy(false);
    if (error) return toast({ title: "Load failed", description: error.message, variant: "destructive" });
    setCodes(data?.codes ?? []);
  };

  useEffect(() => { if (user) refresh(); }, [user]);

  const save = async () => {
    setBusy(true);
    const payload = {
      ...form,
      code: form.code.toUpperCase().trim(),
      value: Number(form.value),
      min_subtotal_cents: Number(form.min_subtotal_cents) || 0,
      usage_limit_total: form.usage_limit_total ? Number(form.usage_limit_total) : null,
      usage_limit_per_customer: Number(form.usage_limit_per_customer) || 1,
      ends_at: form.ends_at || null,
    };
    const { error } = await supabase.functions.invoke("discount-admin", { body: { action: "create", payload } });
    setBusy(false);
    if (error) return toast({ title: "Create failed", description: error.message, variant: "destructive" });
    toast({ title: "Code created", description: "Mirroring to Shopify in background" });
    setDialogOpen(false);
    setForm(empty);
    setTimeout(refresh, 1500);
  };

  const toggleActive = async (c: Code) => {
    await supabase.functions.invoke("discount-admin", { body: { action: "update", payload: { id: c.id, active: !c.active } } });
    refresh();
  };

  const remirror = async (c: Code) => {
    await supabase.functions.invoke("discount-admin", { body: { action: "mirror", payload: { id: c.id } } });
    setTimeout(refresh, 1500);
  };

  const remove = async (c: Code) => {
    if (!confirm(`Delete ${c.code}? This does not remove the Shopify mirror.`)) return;
    await supabase.functions.invoke("discount-admin", { body: { action: "delete", payload: { id: c.id } } });
    refresh();
  };

  if (loading) return <div className="p-10">Loading…</div>;

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => nav("/cms")}><ArrowLeft className="w-4 h-4 mr-2" />CMS</Button>
            <h1 className="text-2xl font-bold">Discount Codes</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh} disabled={busy}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
            <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />New code</Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Non-stacking: one code per cart. Codes never stack on member pricing — cart applies whichever is lower.
          New codes auto-mirror to Shopify (merch + sitewide); wine codes require manual creation in Vinoshipper with matching terms.
        </p>

        <div className="border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="p-3">Code</th>
                <th className="p-3">Discount</th>
                <th className="p-3">Scope / Tier</th>
                <th className="p-3">Used</th>
                <th className="p-3">Mirrors</th>
                <th className="p-3">Active</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-3 font-mono font-bold">{c.code}<div className="text-xs text-muted-foreground font-normal">{c.description}</div></td>
                  <td className="p-3">
                    {c.type === "percent" && `${c.value}% off`}
                    {c.type === "fixed" && `$${c.value} off`}
                    {c.type === "shipping" && `Shipping`}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="mr-1">{c.scope}</Badge>
                    <Badge variant="outline">{c.tier}</Badge>
                  </td>
                  <td className="p-3">{c.usage_count}{c.usage_limit_total ? `/${c.usage_limit_total}` : ""}</td>
                  <td className="p-3 text-xs">
                    <div>Shopify: <span className={c.shopify_mirror_status === "synced" ? "text-green-600" : c.shopify_mirror_status === "failed" ? "text-red-600" : ""}>{c.shopify_mirror_status}</span></div>
                    <div>VS: <span className="text-muted-foreground">{c.vs_mirror_status}</span></div>
                  </td>
                  <td className="p-3"><Switch checked={c.active} onCheckedChange={() => toggleActive(c)} /></td>
                  <td className="p-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => remirror(c)} title="Re-mirror"><RefreshCw className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c)}><Trash2 className="w-3 h-3" /></Button>
                  </td>
                </tr>
              ))}
              {!codes.length && !busy && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No codes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New discount code</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE10" /></div>
              <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent off</SelectItem>
                      <SelectItem value="fixed">Fixed $ off</SelectItem>
                      <SelectItem value="shipping">Shipping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Value</Label><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Scope</Label>
                  <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sitewide">Sitewide</SelectItem>
                      <SelectItem value="wine">Wine only</SelectItem>
                      <SelectItem value="merch">Merch only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tier</Label>
                  <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="club_member">Club / Pack</SelectItem>
                      <SelectItem value="ambassador">Ambassador</SelectItem>
                      <SelectItem value="vip">VIP</SelectItem>
                      <SelectItem value="staff">Staff (comp)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Min subtotal (cents)</Label><Input type="number" value={form.min_subtotal_cents} onChange={(e) => setForm({ ...form, min_subtotal_cents: e.target.value })} /></div>
                <div><Label>Ends at</Label><Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Max total uses</Label><Input type="number" value={form.usage_limit_total} onChange={(e) => setForm({ ...form, usage_limit_total: e.target.value })} placeholder="Unlimited" /></div>
                <div><Label>Max per customer</Label><Input type="number" value={form.usage_limit_per_customer} onChange={(e) => setForm({ ...form, usage_limit_per_customer: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !form.code}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}