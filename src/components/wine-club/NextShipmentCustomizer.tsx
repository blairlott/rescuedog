import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Minus, Trash2, ShoppingBag, AlertTriangle, CheckCircle2, SkipForward } from "lucide-react";
import { toast } from "sonner";
import type { WineClubMembership, WineClubTier } from "@/hooks/useWineClub";

interface ShipmentItem {
  id?: string;
  product_handle: string;
  product_title: string;
  product_image_url: string | null;
  variant_id: string | null;
  price_cents: number;
  quantity: number;
  is_customer_swap?: boolean;
}

interface CatalogWine {
  handle: string;
  title: string;
  varietal: string | null;
  image_url: string | null;
  price_cents: number;
  club_price_cents: number | null;
  vinoshipper_product_id: string | null;
}

interface Props {
  membership: WineClubMembership & { tier: WineClubTier };
}

interface UpsAccessPoint {
  id: string; name: string; line1: string; city: string; state: string; zip: string; distance_miles: number; hours?: string;
}

const LOCKED_STATUSES = new Set(["locked", "shipped", "cancelled"]);

export function NextShipmentCustomizer({ membership }: Props) {
  const [shipment, setShipment] = useState<{ id: string; status: string; shipment_date: string | null; cutoff_at: string | null } | null>(null);
  const [items, setItems] = useState<ShipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<CatalogWine[] | null>(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [destType, setDestType] = useState<"address" | "ups_access_point">("address");
  const [accessPoint, setAccessPoint] = useState<UpsAccessPoint | null>(null);
  const [apZip, setApZip] = useState("");
  const [apResults, setApResults] = useState<UpsAccessPoint[] | null>(null);
  const [apSearching, setApSearching] = useState(false);

  const isLegacy = membership.origin === "vinoshipper_legacy" || (membership as any).is_legacy_member;
  const tier = membership.tier;
  const minBottles = tier?.bottle_count ?? 0;

  useEffect(() => {
    if (isLegacy) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("wine_club_shipments")
        .select("id, status, shipment_date, cutoff_at, delivery_destination_type, delivery_ups_access_point, items:wine_club_shipment_items(*)")
        .eq("membership_id", membership.id)
        .not("status", "in", "(shipped,cancelled)")
        .order("shipment_date", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setShipment({ id: data.id, status: data.status, shipment_date: data.shipment_date, cutoff_at: (data as any).cutoff_at });
        setItems(((data as any).items ?? []).map((i: any) => ({
          id: i.id,
          product_handle: i.product_handle,
          product_title: i.product_title,
          product_image_url: i.product_image_url,
          variant_id: i.variant_id,
          price_cents: i.price_cents ?? 0,
          quantity: i.quantity ?? 1,
          is_customer_swap: i.is_customer_swap,
        })));
        const dt = (data as any).delivery_destination_type;
        const ap = (data as any).delivery_ups_access_point;
        if (dt === "ups_access_point" && ap) { setDestType("ups_access_point"); setAccessPoint(ap); }
      }
      setLoading(false);
    })();
  }, [membership.id, isLegacy]);

  const searchAccessPoints = async () => {
    if (!/^\d{5}$/.test(apZip)) { toast.error("Enter a 5-digit ZIP"); return; }
    setApSearching(true);
    const { data, error } = await supabase.functions.invoke("ups-access-point-search", { body: { zip: apZip } });
    setApSearching(false);
    if (error || (data as any)?.error) { toast.error("Couldn't find UPS Access Points"); return; }
    setApResults(((data as any).results ?? []) as UpsAccessPoint[]);
  };

  const totalBottles = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const totalCents = useMemo(() => items.reduce((s, i) => s + i.price_cents * i.quantity, 0), [items]);
  const memberSavingsCents = useMemo(
    () => Math.round(totalCents * (((tier?.shipment_discount_percent ?? tier?.discount_percent) ?? 0) / 100)),
    [totalCents, tier]
  );
  const locked = !shipment || LOCKED_STATUSES.has(shipment.status);
  const belowMin = totalBottles < minBottles;

  const loadCatalog = async () => {
    if (catalog) return;
    const { data } = await supabase
      .from("wine_products")
      .select("handle,title,varietal,image_url,price_cents,club_price_cents,vinoshipper_product_id")
      .eq("is_active", true)
      .eq("in_stock", true)
      .order("sort_order", { ascending: true })
      .limit(200);
    setCatalog((data ?? []) as CatalogWine[]);
  };

  const addFromCatalog = (w: CatalogWine) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.product_handle === w.handle);
      if (existing) {
        return prev.map((p) => p === existing ? { ...p, quantity: p.quantity + 1 } : p);
      }
      return [...prev, {
        product_handle: w.handle,
        product_title: w.title,
        product_image_url: w.image_url,
        variant_id: w.vinoshipper_product_id,
        price_cents: w.club_price_cents ?? w.price_cents,
        quantity: 1,
        is_customer_swap: true,
      }];
    });
  };

  const updateQty = (idx: number, delta: number) => {
    setItems((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: Math.max(0, p.quantity + delta) } : p).filter((p) => p.quantity > 0));
  };
  const remove = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    if (!shipment) return;
    if (belowMin) { toast.error(`Tier minimum is ${minBottles} bottles`); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("wine-club-shipment-save", {
      body: {
        shipment_id: shipment.id,
        items: items.map(({ id, is_customer_swap, ...rest }) => rest),
        delivery_destination_type: destType,
        delivery_ups_access_point: destType === "ups_access_point" ? accessPoint : null,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Could not save");
      return;
    }
    toast.success("Your shipment has been customized");
    setShipment((s) => s ? { ...s, status: "customer_customized" } : s);
  };

  const skip = async () => {
    if (!shipment) return;
    if (!confirm("Skip this shipment? Your membership stays active and resumes next cycle.")) return;
    setSaving(true);
    const { error } = await supabase.functions.invoke("wine-club-shipment-save", {
      body: { shipment_id: shipment.id, items: [], action: "skip" },
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Shipment skipped");
    setShipment((s) => s ? { ...s, status: "skipped" } : s);
  };

  if (isLegacy) {
    return (
      <div className="border border-border p-6 mb-8">
        <h3 className="font-bold text-foreground mb-2 flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> Next Shipment</h3>
        <p className="text-sm text-muted-foreground">
          Your membership is managed in Vinoshipper. To customize upcoming shipments, please use your Vinoshipper account.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="border border-border p-6 mb-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading next shipment…</div>;
  }

  if (!shipment) {
    return (
      <div className="border border-border p-8 text-center mb-8">
        <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-bold text-foreground mb-2">No upcoming shipment yet</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          We'll email you as soon as your next shipment opens for customization.
        </p>
      </div>
    );
  }

  const filteredCatalog = (catalog ?? []).filter((w) =>
    !search ||
    w.title.toLowerCase().includes(search.toLowerCase()) ||
    (w.varietal ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="border border-border p-6 mb-8">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-foreground flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> Next Shipment</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Ships {shipment.shipment_date ? new Date(shipment.shipment_date).toLocaleDateString() : "TBD"}
            {shipment.cutoff_at && ` · Locks ${new Date(shipment.cutoff_at).toLocaleDateString()}`}
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-brand font-bold px-2 py-1 bg-muted">{shipment.status.replace(/_/g, " ")}</span>
      </div>

      {/* Delivery destination */}
      <div className="border border-border p-3 mb-4 bg-muted/20">
        <div className="text-xs font-bold uppercase tracking-brand mb-2">Delivery destination</div>
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <button type="button" disabled={locked} onClick={() => setDestType("address")} className={`flex-1 border p-2 text-sm text-left ${destType === "address" ? "border-primary bg-primary/5" : "border-border"}`}>
            <div className="font-bold">Ship to my address</div>
            <div className="text-xs text-muted-foreground">Adult signature 21+ required</div>
          </button>
          <button type="button" disabled={locked} onClick={() => setDestType("ups_access_point")} className={`flex-1 border p-2 text-sm text-left ${destType === "ups_access_point" ? "border-primary bg-primary/5" : "border-border"}`}>
            <div className="font-bold">UPS Access Point</div>
            <div className="text-xs text-muted-foreground">Pick up with ID 21+</div>
          </button>
        </div>
        {destType === "ups_access_point" && (
          <div className="space-y-2 mt-2">
            {accessPoint && (
              <div className="border border-border p-2 text-xs">
                <div className="font-bold">{accessPoint.name}</div>
                <div className="text-muted-foreground">{accessPoint.line1}, {accessPoint.city}, {accessPoint.state} {accessPoint.zip}</div>
              </div>
            )}
            {!locked && (
              <div className="flex gap-2">
                <Input value={apZip} onChange={(e) => setApZip(e.target.value)} placeholder="ZIP code" maxLength={5} className="h-8 text-sm" />
                <Button size="sm" variant="outline" onClick={searchAccessPoints} disabled={apSearching}>
                  {apSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Search"}
                </Button>
              </div>
            )}
            {apResults && apResults.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {apResults.map((ap) => (
                  <button key={ap.id} onClick={() => { setAccessPoint(ap); setApResults(null); }} className="w-full text-left border border-border p-2 text-xs hover:border-primary">
                    <div className="font-bold">{ap.name}</div>
                    <div className="text-muted-foreground">{ap.line1}, {ap.city}, {ap.state} {ap.zip} · {ap.distance_miles.toFixed(1)} mi</div>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">Adult signature 21+ still required at the UPS Access Point. Bring a valid government-issued ID matching the order name.</p>
          </div>
        )}
      </div>

      {locked && (
        <div className="border border-border bg-muted/40 p-3 text-xs text-muted-foreground mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> This shipment is locked and can no longer be edited.
        </div>
      )}

      <div className="space-y-2 mb-4">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No bottles selected yet — add some below.</p>
        )}
        {items.map((it, idx) => (
          <div key={(it.id ?? "new") + idx} className="flex items-center gap-3 border border-border p-3">
            {it.product_image_url ? (
              <img src={it.product_image_url} alt="" className="h-14 w-14 object-cover" />
            ) : (
              <div className="h-14 w-14 bg-muted" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{it.product_title}</div>
              <div className="text-xs text-muted-foreground">${(it.price_cents / 100).toFixed(2)} each</div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8" disabled={locked} onClick={() => updateQty(idx, -1)}><Minus className="h-3 w-3" /></Button>
              <span className="w-6 text-center text-sm font-bold">{it.quantity}</span>
              <Button size="icon" variant="outline" className="h-8 w-8" disabled={locked} onClick={() => updateQty(idx, 1)}><Plus className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={locked} onClick={() => remove(idx)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm mb-4 pt-3 border-t border-border">
        <div>
          <div className={belowMin ? "text-destructive font-bold" : "font-bold"}>
            {totalBottles} / {minBottles} bottle{minBottles !== 1 && "s"} minimum
            {!belowMin && <CheckCircle2 className="inline h-4 w-4 ml-1 text-primary" />}
          </div>
          {belowMin && <div className="text-xs text-destructive">Add {minBottles - totalBottles} more to meet your tier minimum.</div>}
        </div>
        <div className="text-right">
          <div className="font-bold">${(totalCents / 100).toFixed(2)}</div>
          {memberSavingsCents > 0 && <div className="text-xs text-primary">Member saves ${(memberSavingsCents / 100).toFixed(2)}</div>}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Sheet open={drawerOpen} onOpenChange={(o) => { setDrawerOpen(o); if (o) loadCatalog(); }}>
          <SheetTrigger asChild>
            <Button variant="outline" disabled={locked} className="gap-2 flex-1"><Plus className="h-4 w-4" /> Add wines</Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader><SheetTitle>Add wines to your shipment</SheetTitle></SheetHeader>
            <Input placeholder="Search by name or varietal" value={search} onChange={(e) => setSearch(e.target.value)} className="my-4" />
            <div className="space-y-2">
              {!catalog && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…</div>}
              {catalog && filteredCatalog.length === 0 && <p className="text-sm text-muted-foreground">No wines match.</p>}
              {filteredCatalog.map((w) => (
                <button key={w.handle} onClick={() => addFromCatalog(w)} className="w-full flex items-center gap-3 border border-border p-2 hover:border-primary text-left">
                  {w.image_url ? <img src={w.image_url} alt="" className="h-12 w-12 object-cover" /> : <div className="h-12 w-12 bg-muted" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{w.title}</div>
                    <div className="text-xs text-muted-foreground">{w.varietal} · ${((w.club_price_cents ?? w.price_cents) / 100).toFixed(2)}</div>
                  </div>
                  <Plus className="h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
        <Button onClick={save} disabled={saving || locked || belowMin} className="flex-1">
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save customization
        </Button>
        <Button variant="ghost" onClick={skip} disabled={saving || locked} className="gap-2"><SkipForward className="h-4 w-4" /> Skip</Button>
      </div>
    </div>
  );
}