import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Lock, Wine, Apple, Smartphone, Home, MapPin } from "lucide-react";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCartStore } from "@/stores/cartStore";
import { useMyMembership } from "@/hooks/useWineClub";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useCheckoutIntentStore } from "@/stores/checkoutIntentStore";
import { supabase } from "@/integrations/supabase/client";
import { getFbc, getFbp, getGclaw, getGclid } from "@/lib/metaAttribution";
import {
  VS_FLAT_SHIPPING_USD,
  VS_MEMBER_DISCOUNT_PERCENT,
  VS_SHIPPING_THRESHOLD_BOTTLES,
  VS_SIMULATION,
} from "@/lib/vinoshipperConfig";
import { effectiveBottleCount, discountEligibleSubtotal } from "@/lib/wineBundles";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AccessPoint {
  name: string;
  address: string;
  distance: string;
  lat: number;
  lng: number;
}

/**
 * Simulated Vinoshipper-hosted checkout overlay.
 * Mimics the real VS cart screen so we can demo the full flow on iPhone
 * without Account ID / API keys yet. On "Place Order" it logs a fake
 * vinoshipper_webhook_logs row and clears the cart.
 */
export function VinoshipperCheckoutModal({ open, onOpenChange }: Props) {
  const { user } = useCustomerAuth();
  const { data: membership } = useMyMembership();
  const { items, clearCart } = useCartStore();
  const checkoutIntent = useCheckoutIntentStore((s) => s.intent);
  const resetCheckoutIntent = useCheckoutIntentStore((s) => s.reset);

  const [ageOk, setAgeOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shipMethod, setShipMethod] = useState<"home" | "ups_ap">("home");
  const [accessPoint, setAccessPoint] = useState<AccessPoint | null>(null);
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [loadingAPs, setLoadingAPs] = useState(false);
  const abandonmentIdRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    email: user?.email ?? "",
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    card: "4242 4242 4242 4242",
    exp: "12/29",
    cvc: "123",
  });

  // Autofill ship-to from membership address once available
  useEffect(() => {
    if (!membership) return;
    setForm((p) => ({
      ...p,
      email: p.email || user?.email || "",
      address: p.address || membership.shipping_address_line1 || "",
      city: p.city || membership.shipping_city || "",
      state: p.state || membership.shipping_state || "",
      zip: p.zip || membership.shipping_zip || "",
    }));
  }, [membership, user]);

  // Bundles count as 6 bottles toward the shipping-included threshold.
  const totalBottles = effectiveBottleCount(items as any);
  const subtotal = items.reduce(
    (s, i) => s + parseFloat(i.price.amount) * i.quantity,
    0,
  );
  const isMember = !!membership && membership.status !== "cancelled";
  const joiningClub = checkoutIntent === "club" && !isMember;
  // Joining the club applies the same 20% member discount on this order.
  const discountActive = isMember || joiningClub;
  // Bundles are excluded from member discount (matches Vinoshipper rule).
  const discountable = useMemo(() => discountEligibleSubtotal(items as any), [items]);
  const memberDiscount = useMemo(
    () => (discountActive ? discountable * (VS_MEMBER_DISCOUNT_PERCENT / 100) : 0),
    [discountActive, discountable],
  );
  const baseShipping =
    totalBottles >= VS_SHIPPING_THRESHOLD_BOTTLES ? 0 : VS_FLAT_SHIPPING_USD;
  // UPS Access Point: $5 off home delivery, min $0
  const shipping =
    shipMethod === "ups_ap" ? Math.max(0, baseShipping - 5) : baseShipping;
  const tax = (subtotal - memberDiscount) * 0.07; // sim flat 7%
  const total = subtotal - memberDiscount + shipping + tax;

  const update = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Simulated UPS Access Point lookup based on ZIP
  const findAccessPoint = async () => {
    if (!form.zip || form.zip.length < 5) {
      toast.error("Enter a ZIP first to find a nearby UPS Access Point");
      return;
    }
    setLoadingAPs(true);
    try {
      let center: [number, number] | null = null;
      let cityState = { city: form.city, state: form.state };
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geocode-zip?zip=${form.zip}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        });
        if (res.ok) {
          const j = await res.json();
          center = [j.lat, j.lng];
          cityState = { city: j.city || form.city, state: j.state || form.state };
        }
      } catch {}
      if (!center) {
        // Last-resort fallback center (continental US-ish)
        center = [39.8283, -98.5795];
      }
      const [lat, lng] = center;
      // Sim points offset around center (~0.5–3 mi)
      const aps: AccessPoint[] = [
        { name: "The UPS Store #4821", address: `1820 Main St, ${cityState.city || "Nearby"}, ${cityState.state || ""} ${form.zip}`, distance: "0.6 mi", lat: lat + 0.008, lng: lng + 0.006 },
        { name: "CVS — UPS Access Point", address: `455 Oak Ave, ${cityState.city || "Nearby"}, ${cityState.state || ""} ${form.zip}`, distance: "1.2 mi", lat: lat - 0.012, lng: lng + 0.014 },
        { name: "Michaels — UPS Access Point", address: `2200 Market Pl, ${cityState.city || "Nearby"}, ${cityState.state || ""} ${form.zip}`, distance: "2.8 mi", lat: lat + 0.022, lng: lng - 0.018 },
      ];
      setMapCenter(center);
      setAccessPoints(aps);
      setAccessPoint((prev) => prev ?? aps[0]);
      setShipMethod("ups_ap");
      setShowMap(true);
      toast.success("Pick your UPS Access Point on the map");
    } catch (e: any) {
      toast.error("Could not load access points", { description: e?.message });
    } finally {
      setLoadingAPs(false);
    }
  };

  // Capture abandonment: insert a row when the modal opens with items,
  // mark converted on successful order, mark abandoned on close-with-items.
  useEffect(() => {
    if (!open || items.length === 0 || abandonmentIdRef.current) return;
    (async () => {
      const { data, error } = await supabase
        .from("cart_abandonments")
        .insert({
          user_id: user?.id ?? null,
          email: form.email || user?.email || null,
          items: items.map((i) => ({
            handle: i.product.node.handle,
            title: i.product.node.title,
            variant_id: i.variantId,
            quantity: i.quantity,
            unit_price: parseFloat(i.price.amount),
            image: i.product.node.images?.edges?.[0]?.node?.url ?? null,
          })),
          subtotal_cents: Math.round(subtotal * 100),
          total_bottles: totalBottles,
          status: "opened",
          source: "vs_checkout_sim",
        })
        .select("id")
        .maybeSingle();
      if (!error && data) abandonmentIdRef.current = data.id;
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAbandonment = async (status: "abandoned" | "converted") => {
    const id = abandonmentIdRef.current;
    if (!id) return;
    await supabase
      .from("cart_abandonments")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", id);
    abandonmentIdRef.current = null;
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && items.length > 0 && abandonmentIdRef.current) {
      void markAbandonment("abandoned");
    }
    onOpenChange(next);
  };

  const placeOrder = async () => {
    if (!ageOk) {
      toast.error("Please confirm you are 21 or older");
      return;
    }
    setSubmitting(true);
    try {
      const fakeOrderId = `SIM-${Date.now()}`;
      const attribution = {
        fbc: getFbc(),
        fbp: getFbp(),
        gclid: getGclid(),
        gclaw: getGclaw(),
        landing_url: typeof window !== "undefined" ? window.location.href : null,
      };
      const { error } = await supabase.from("vinoshipper_webhook_logs").insert({
        event: "order.created",
        subject: "order",
        identifier: fakeOrderId,
        payload: {
          simulated: true,
          order_id: fakeOrderId,
          customer_email: form.email,
          customer_id:
            (membership as unknown as { vinoshipper_customer_id?: string | null })
              ?.vinoshipper_customer_id ?? null,
          line_items: items.map((i) => ({
            title: i.product.node.title,
            variant_id: i.variantId,
            quantity: i.quantity,
            unit_price: parseFloat(i.price.amount),
          })),
          wine_club_signup: joiningClub
            ? { tier: "to_be_selected", discount_applied_percent: VS_MEMBER_DISCOUNT_PERCENT }
            : null,
          totals: {
            subtotal: subtotal.toFixed(2),
            member_discount: memberDiscount.toFixed(2),
            shipping: shipping.toFixed(2),
            tax: tax.toFixed(2),
            total: total.toFixed(2),
          },
          ship_to: {
            name: form.name,
            address: form.address,
            city: form.city,
            state: form.state,
            zip: form.zip,
          },
          shipping_method: shipMethod === "ups_ap" ? "UPS_ACCESS_POINT" : "HOME_DELIVERY",
          ups_access_point: shipMethod === "ups_ap" && accessPoint
            ? { ...accessPoint }
            : null,
          attribution,
        } as any,
        notes: "Simulated checkout — Vinoshipper Injector not yet live",
      });
      if (error) throw error;
      await markAbandonment("converted");
      toast.success("Order placed (simulated)", {
        description: `Order ${fakeOrderId} — total $${total.toFixed(2)}`,
      });
      clearCart();
      resetCheckoutIntent();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Could not log simulated order", {
        description: e?.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 flex flex-col">
        <div className="overflow-y-auto p-6 pb-32 flex-1 space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Wine className="h-5 w-5 text-primary" />
            Vinoshipper Checkout
            {VS_SIMULATION && (
              <span className="text-[10px] uppercase tracking-brand bg-brand-gold/20 text-brand-gold px-2 py-0.5 rounded-sm">
                Simulation
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Wine orders are processed by Vinoshipper for compliance &
            payment. In simulation mode no card is charged.
          </DialogDescription>
        </DialogHeader>

        {/* Express wallet buttons (simulated) */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="bg-foreground text-background hover:bg-foreground/90"
            onClick={placeOrder}
            disabled={submitting || items.length === 0 || !ageOk}
          >
            <Apple className="h-4 w-4 mr-2" /> Apple Pay
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={placeOrder}
            disabled={submitting || items.length === 0 || !ageOk}
          >
            <Smartphone className="h-4 w-4 mr-2" /> Google Pay
          </Button>
        </div>
        <div className="text-center text-[10px] uppercase tracking-brand text-muted-foreground -my-1">
          or pay with card
        </div>

        {/* Summary */}
        <div className="border border-border p-3 text-sm space-y-1 bg-muted/30">
          {items.map((i) => (
            <div key={i.variantId} className="flex justify-between">
              <span className="truncate pr-2">
                {i.quantity}× {i.product.node.title}
              </span>
              <span>
                ${(parseFloat(i.price.amount) * i.quantity).toFixed(2)}
              </span>
            </div>
          ))}
          <div className="border-t border-border my-2" />
          <Row label="Subtotal" value={subtotal} />
          {discountActive && (
            <Row
              label={`${joiningClub ? "Club join" : "Member"} discount (${VS_MEMBER_DISCOUNT_PERCENT}%)`}
              value={-memberDiscount}
              accent
            />
          )}
          <Row
            label={
              shipping === 0
                ? `Shipping (${shipMethod === "ups_ap" ? "UPS Access Point" : "included, 6+ bottles"})`
                : shipMethod === "ups_ap"
                  ? "Shipping (UPS Access Point — save $5)"
                  : "Shipping (Home delivery, adult signature)"
            }
            value={shipping}
          />
          <Row label="Tax (est.)" value={tax} />
          <div className="flex justify-between font-bold pt-1 border-t border-border">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Ship to */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" value={form.email} onChange={(v) => update("email", v)} />
            <Field label="Full name" value={form.name} onChange={(v) => update("name", v)} />
          </div>
          <Field label="Street address" value={form.address} onChange={(v) => update("address", v)} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={form.city} onChange={(v) => update("city", v)} />
            <Field label="State" value={form.state} onChange={(v) => update("state", v)} />
            <Field label="ZIP" value={form.zip} onChange={(v) => update("zip", v)} />
          </div>
        </div>

        {/* Shipping method */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-brand text-muted-foreground">
            Delivery method
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShipMethod("home")}
              className={`border p-3 text-left text-xs space-y-1 transition ${
                shipMethod === "home"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <Home className="h-3.5 w-3.5" /> Home delivery
              </div>
              <div className="text-muted-foreground">
                Adult (21+) signature required at door
              </div>
            </button>
            <button
              type="button"
              onClick={() => (accessPoint ? setShipMethod("ups_ap") : findAccessPoint())}
              className={`border p-3 text-left text-xs space-y-1 transition ${
                shipMethod === "ups_ap"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <MapPin className="h-3.5 w-3.5" /> UPS Access Point
              </div>
              <div className="text-muted-foreground">
                Pick up nearby with ID — save $5
              </div>
            </button>
          </div>
          {shipMethod === "ups_ap" && (
            <div className="border border-border bg-muted/30 p-3 text-xs space-y-2">
              {accessPoints.length > 0 && mapCenter && (
                <div className="h-44 w-full overflow-hidden border border-border">
                  <MapContainer
                    center={mapCenter}
                    zoom={13}
                    scrollWheelZoom={false}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution="&copy; OpenStreetMap"
                      url="https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
                    />
                    <RecenterMap center={mapCenter} />
                    {accessPoints.map((ap, idx) => {
                      const selected = accessPoint?.name === ap.name;
                      return (
                        <Marker
                          key={idx}
                          position={[ap.lat, ap.lng]}
                          icon={makeIcon(selected)}
                          eventHandlers={{ click: () => setAccessPoint(ap) }}
                        >
                          <Popup>
                            <div className="text-xs">
                              <div className="font-semibold">{ap.name}</div>
                              <div>{ap.address}</div>
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                  </MapContainer>
                </div>
              )}
              {accessPoints.length > 0 ? (
                <div className="space-y-1">
                  {accessPoints.map((ap, idx) => {
                    const selected = accessPoint?.name === ap.name;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAccessPoint(ap)}
                        className={`w-full text-left border p-2 text-xs transition ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-foreground/30"
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span>{ap.name}</span>
                          <span className="text-muted-foreground">{ap.distance}</span>
                        </div>
                        <div className="text-muted-foreground">{ap.address}</div>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={findAccessPoint}
                    disabled={loadingAPs}
                    className="text-primary underline underline-offset-2 text-[11px]"
                  >
                    {loadingAPs ? "Refreshing…" : "Refresh nearby locations"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={findAccessPoint}
                  disabled={loadingAPs}
                  className="text-primary underline underline-offset-2"
                >
                  {loadingAPs
                    ? "Searching nearby Access Points…"
                    : `Find UPS Access Points near ${form.zip || "me"}`}
                </button>
              )}
              <div className="text-[10px] text-muted-foreground pt-1">
                Government-issued ID (21+) required at pickup. Held up to 7 days.
              </div>
            </div>
          )}
        </div>

        {/* Payment (fake) */}
        <div className="border border-border p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Card vaulted by Vinoshipper / Stripe
          </div>
          <Field label="Card number" value={form.card} onChange={(v) => update("card", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Exp" value={form.exp} onChange={(v) => update("exp", v)} />
            <Field label="CVC" value={form.cvc} onChange={(v) => update("cvc", v)} />
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={ageOk}
            onCheckedChange={(c) => setAgeOk(!!c)}
          />
          <span>
            I confirm I am 21 or older and an adult will be available to sign
            for delivery.
          </span>
        </label>
        </div>

        {/* Sticky bottom CTA — thumb reach on mobile */}
        <div className="absolute bottom-0 inset-x-0 bg-background border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            onClick={placeOrder}
            disabled={submitting || items.length === 0 || !ageOk}
            size="lg"
            className="w-full"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Place order — $${total.toFixed(2)}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${accent ? "text-primary font-semibold" : ""}`}
    >
      <span>{label}</span>
      <span>
        {value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

function makeIcon(selected: boolean) {
  const color = selected ? "hsl(354 100% 38%)" : "hsl(0 0% 15%)";
  const html = `
    <div style="position:relative;width:28px;height:36px;">
      <svg viewBox="0 0 28 36" width="28" height="36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="${color}"/>
        <circle cx="14" cy="14" r="6" fill="white"/>
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32],
  });
}