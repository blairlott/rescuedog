import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Store, Check, X, ExternalLink, Package, Mail } from "lucide-react";

type App = any; type Prod = any;
const STATUSES = ["pending", "under_review", "approved", "rejected", "needs_info"] as const;

export function MarketplaceTab() {
  const [view, setView] = useState<"applications" | "products">("applications");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [apps, setApps] = useState<App[]>([]);
  const [prods, setProds] = useState<Prod[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    if (view === "applications") {
      const { data } = await supabase
        .from("marketplace_partner_applications")
        .select("*").eq("status", statusFilter)
        .order("created_at", { ascending: false }).limit(100);
      setApps((data as any) ?? []);
    } else {
      const { data } = await supabase
        .from("marketplace_partner_products")
        .select("*").eq("status", statusFilter === "under_review" ? "needs_info" : statusFilter)
        .order("created_at", { ascending: false }).limit(100);
      setProds((data as any) ?? []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [view, statusFilter]);

  const decideApp = async (a: App, decision: "approved" | "rejected" | "needs_info" | "under_review") => {
    const updates: any = { status: decision, admin_note: notes[a.id] ?? null, reviewed_at: new Date().toISOString() };
    if (decision === "approved") {
      const slug = a.business_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `partner-${Date.now()}`;
      const { data: partner } = await supabase.from("dropship_partners").insert({
        name: a.business_name, slug, contact_email: a.contact_email, contact_phone: a.contact_phone,
        vendor_type: a.fulfillment_model === "print_on_demand" ? "printify" : "partner_direct",
        simulation_mode: true, status: "active",
        notes: `Onboarded via marketplace application ${a.id}`,
      }).select("id").single();
      if (partner) updates.approved_partner_id = partner.id;
    }
    const { error } = await supabase.from("marketplace_partner_applications").update(updates).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${decision.replace("_", " ")}`);
    load();
  };

  const decideProd = async (p: Prod, decision: "approved" | "rejected" | "needs_info") => {
    const updates: any = { status: decision, admin_note: notes[p.id] ?? null, reviewed_at: new Date().toISOString() };
    if (decision === "approved" && p.partner_id) {
      const { data: sku } = await supabase.from("dropship_skus").insert({
        partner_id: p.partner_id,
        sku: p.proposed_sku || `MKT-${Date.now()}`,
        product_title: p.product_title,
        product_image_url: p.product_image_url,
        gallery_urls: p.gallery_urls ?? [],
        long_description: p.product_description,
        category: p.category ?? "apparel",
        retail_cents: p.proposed_retail_cents,
        cost_cents: p.partner_cost_cents,
        fulfillment_mode: p.fulfillment_mode ?? "partner_direct",
        is_active: false, // admin still reviews in SKUs tab before going live
      }).select("id").single();
      if (sku) updates.promoted_sku_id = sku.id;
    }
    const { error } = await supabase.from("marketplace_partner_products").update(updates).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(`Product ${decision}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Marketplace Partners</h2>
          <span className="text-xs text-muted-foreground">Apply-to-sell applications & per-product approvals</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={view === "applications" ? "default" : "outline"} onClick={() => setView("applications")}>Applications</Button>
          <Button size="sm" variant={view === "products" ? "default" : "outline"} onClick={() => setView("products")}>Product Submissions</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="capitalize">
            {s.replace("_", " ")}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : view === "applications" ? (
        apps.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">No {statusFilter.replace("_", " ")} applications.</Card>
        ) : (
          <div className="grid gap-3">
            {apps.map((a) => (
              <Card key={a.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold">{a.business_name}</h3>
                      <Badge variant="outline">{a.fulfillment_model}</Badge>
                      <Badge>{a.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {a.contact_name} · <a href={`mailto:${a.contact_email}`} className="underline">{a.contact_email}</a>
                      {a.contact_phone ? ` · ${a.contact_phone}` : ""}
                    </p>
                    {a.website && <a href={a.website} target="_blank" rel="noopener" className="text-xs text-primary inline-flex items-center gap-1 mt-1"><ExternalLink className="h-3 w-3" />{a.website}</a>}
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    Submitted {new Date(a.created_at).toLocaleDateString()}
                    {a.years_in_business ? ` · ${a.years_in_business}y in business` : ""}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div><span className="font-semibold text-muted-foreground">Categories: </span>{(a.product_categories ?? []).join(", ") || "—"}</div>
                  <div><span className="font-semibold text-muted-foreground">Est. monthly units: </span>{a.est_monthly_units ?? "—"}</div>
                </div>
                <div className="text-sm"><span className="font-semibold text-muted-foreground">Products: </span>{a.product_description}</div>
                {a.brand_story && <div className="text-sm"><span className="font-semibold text-muted-foreground">Story: </span>{a.brand_story}</div>}
                {a.why_partner && <div className="text-sm"><span className="font-semibold text-muted-foreground">Why us: </span>{a.why_partner}</div>}
                {(a.sample_product_urls ?? []).length > 0 && (
                  <div className="text-xs">
                    <span className="font-semibold text-muted-foreground">Samples: </span>
                    {a.sample_product_urls.map((u: string) => <a key={u} href={u} target="_blank" rel="noopener" className="text-primary underline mr-2">{u}</a>)}
                  </div>
                )}
                {a.admin_note && <p className="text-xs text-muted-foreground">Note: {a.admin_note}</p>}
                {a.status !== "approved" && a.status !== "rejected" && (
                  <div className="space-y-2 pt-2 border-t">
                    <Textarea placeholder="Internal note (sent in any status email)" value={notes[a.id] ?? ""} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} rows={2} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => decideApp(a, "approved")}><Check className="h-4 w-4 mr-1" />Approve & create partner</Button>
                      <Button size="sm" variant="outline" onClick={() => decideApp(a, "needs_info")}><Mail className="h-4 w-4 mr-1" />Request info</Button>
                      <Button size="sm" variant="outline" onClick={() => decideApp(a, "under_review")}>Mark under review</Button>
                      <Button size="sm" variant="destructive" onClick={() => decideApp(a, "rejected")}><X className="h-4 w-4 mr-1" />Reject</Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
      ) : (
        prods.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">No {statusFilter} product submissions.</Card>
        ) : (
          <div className="grid gap-3">
            {prods.map((p) => (
              <Card key={p.id} className="p-4 space-y-3">
                <div className="flex gap-3">
                  {p.product_image_url && <img src={p.product_image_url} alt="" className="h-20 w-20 object-cover border" />}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{p.product_title}</h3>
                      <Badge>{p.status}</Badge>
                      <Badge variant="outline">{p.fulfillment_mode}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.submitted_by_email ?? "Partner"} · SKU {p.proposed_sku || "auto"} · {p.category ?? "—"}
                    </p>
                    <p className="text-sm mt-2">{p.product_description}</p>
                    <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                      <div><span className="text-muted-foreground">Retail: </span>${(p.proposed_retail_cents/100).toFixed(2)}</div>
                      <div><span className="text-muted-foreground">Cost: </span>${(p.partner_cost_cents/100).toFixed(2)}</div>
                      <div><span className="text-muted-foreground">Margin: </span>{p.proposed_retail_cents>0 ? Math.round(((p.proposed_retail_cents - p.partner_cost_cents)/p.proposed_retail_cents)*100) : 0}%</div>
                    </div>
                    {p.admin_note && <p className="text-xs text-muted-foreground mt-2">Note: {p.admin_note}</p>}
                  </div>
                </div>
                {p.status !== "approved" && p.status !== "rejected" && (
                  <div className="space-y-2 pt-2 border-t">
                    <Textarea placeholder="Internal note" value={notes[p.id] ?? ""} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} rows={2} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => decideProd(p, "approved")}><Check className="h-4 w-4 mr-1" /><Package className="h-4 w-4 mr-1" />Approve & draft SKU</Button>
                      <Button size="sm" variant="outline" onClick={() => decideProd(p, "needs_info")}>Request info</Button>
                      <Button size="sm" variant="destructive" onClick={() => decideProd(p, "rejected")}><X className="h-4 w-4 mr-1" />Reject</Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}