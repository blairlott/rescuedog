import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Lock, Wine, Apple, Smartphone, Home, MapPin, ShoppingBag, CheckCircle2, ExternalLink } from "lucide-react";
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
import { addLinesAndGoToHostedCart } from "@/lib/vinoshipperInjector";
import { recordCheckoutIntent } from "@/lib/abCheckoutIntent";
import {
  VS_FLAT_SHIPPING_USD,
  VS_MEMBER_DISCOUNT_PERCENT,
  VS_SHIPPING_THRESHOLD_BOTTLES,
  VS_FLAT_SHIPPING_MIN_BOTTLES,
  VS_SIMULATION,
  memberDiscountPercent,
} from "@/lib/vinoshipperConfig";
import { effectiveBottleCount, caseEligibleBottleCount, discountEligibleSubtotal } from "@/lib/wineBundles";
import { useCartSettings } from "@/hooks/useCartSettings";
import { getSignupPromo, markSignupPromoUsed } from "@/lib/signupPromo";
import { WineShippingPolicy } from "@/components/cart/WineShippingPolicy";
import { isAgeVerified } from "@/lib/ageVerification";

// localStorage key for cross-session prefill of buyer email/zip so the
// VS hosted cart can recognize returning customers via Shop Pay / saved
// card associations without re-typing.
const BUYER_PROFILE_KEY = "rdw_buyer_profile";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When set, the customer also has merch in their cart. After wine
   * checkout succeeds, the modal shows a handoff screen with a CTA
   * that opens the Shopify checkout in a new tab (fresh user gesture,
   * so popups are not blocked) and writes a pending_merch_handoffs row
   * for the reminder-email cron to act on if the customer bails.
   */
  pendingMerchHandoff?: {
    checkoutUrl: string;
    itemCount: number;
    subtotalCents: number;
    items: Array<{ handle: string; title: string; variant_id: string; quantity: number; unit_price: number }>;
  } | null;
  /** Called after wine order is successfully placed (success branch only). */
  onWineOrderPlaced?: (info: { orderId: string; total: number; bottles: number }) => void;
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
export function VinoshipperCheckoutModal({ open, onOpenChange, pendingMerchHandoff, onWineOrderPlaced }: Props) {
  // Live mode: card + shipping captured on Vinoshipper's hosted cart for PCI
  // compliance. The modal becomes a branded review screen + age confirmation.
  // Simulation mode keeps the full in-modal form for demo / iPhone walkthroughs.
  const liveMode = !VS_SIMULATION;
  const { user } = useCustomerAuth();
  const { data: membership } = useMyMembership();
  const { items, clearCart, removeItem } = useCartStore();
  const { caseDiscountCode, fullCaseCount } = useCartSettings();
  const checkoutIntent = useCheckoutIntentStore((s) => s.intent);
  const resetCheckoutIntent = useCheckoutIntentStore((s) => s.reset);
  const clubTierId = useCheckoutIntentStore((s) => s.clubTierId);

  const [ageOk, setAgeOk] = useState(() => isAgeVerified());
  const [submitting, setSubmitting] = useState(false);
  // After wine succeeds, if merch is pending, we show a handoff screen
  // instead of immediately closing + navigating away. The CTA on that
  // screen opens Shopify in a new tab as a direct user gesture.
  const [merchHandoffReady, setMerchHandoffReady] = useState<null | {
    orderId: string;
    total: number;
    bottles: number;
    /**
     * Snapshot of the merch handoff captured at the moment wine succeeds.
     * We can't rely on the live `pendingMerchHandoff` prop here because the
     * parent CartDrawer re-renders right after wine items are removed and
     * passes `pendingMerchHandoff={null}` (no wine + merch → no dual), which
     * would unmount the handoff screen mid-flow.
     */
    handoff: NonNullable<Props["pendingMerchHandoff"]>;
  }>(null);
  // After hand-off to Vinoshipper's hosted cart we cannot trust that the
  // customer actually paid until we receive an ORDER webhook back. Show a
  // waiting screen and poll the server until confirmation arrives — only
  // THEN clear wine from cart, mark abandonment converted, and reveal the
  // merch handoff CTA. If the customer never completes, wine stays in
  // their cart so they're routed straight back to it.
  const [awaitingPayment, setAwaitingPayment] = useState<null | {
    handoffAt: string;
    email: string;
    bottles: number;
    total: number;
    handoff: Props["pendingMerchHandoff"] | null;
  }>(null);
  const [awaitingTimedOut, setAwaitingTimedOut] = useState(false);
  const [shipMethod, setShipMethod] = useState<"home" | "ups_ap">("home");
  const [accessPoint, setAccessPoint] = useState<AccessPoint | null>(null);
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [loadingAPs, setLoadingAPs] = useState(false);
  const abandonmentIdRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    email: user?.email ?? "demo.customer@rescuedogwines.com",
    name: "Sam Rescue",
    address: "1234 Vintner Lane",
    city: "Lodi",
    state: "CA",
    zip: "95240",
    card: "4242 4242 4242 4242",
    exp: "12/29",
    cvc: "123",
  });
  const navigate = useNavigate();

  // Rehydrate buyer profile (email + zip + name + address) from prior
  // checkouts so returning users don't re-type. Runs once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BUYER_PROFILE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<typeof form>;
      setForm((p) => ({
        ...p,
        email: saved.email || user?.email || p.email,
        name: saved.name || p.name,
        address: saved.address || p.address,
        city: saved.city || p.city,
        state: saved.state || p.state,
        zip: saved.zip || p.zip,
      }));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist buyer profile whenever the customer edits the form (debounced
  // implicitly by React re-renders). Never persists card data.
  useEffect(() => {
    try {
      localStorage.setItem(
        BUYER_PROFILE_KEY,
        JSON.stringify({
          email: form.email,
          name: form.name,
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
        }),
      );
    } catch { /* ignore */ }
  }, [form.email, form.name, form.address, form.city, form.state, form.zip]);

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
  // Sampler / bundle SKUs are excluded from the full-case discount,
  // so qualification uses only standalone wine bottles.
  const caseBottles = caseEligibleBottleCount(items as any);
  const subtotal = items.reduce(
    (s, i) => s + parseFloat(i.price.amount) * i.quantity,
    0,
  );
  const isMember = !!membership && membership.status !== "cancelled";
  const joiningClub = checkoutIntent === "club" && !isMember;
  // Guest case discount code is only valid when the customer is NOT a member
  // (members get the higher 20% via Vinoshipper customer-group discount,
  // applied automatically at checkout — no code needed).
  // Case discount (20%) wins over the signup code (10%) when both could apply.
  // Signup / case promo codes apply to anyone who is NOT already a member —
  // including customers joining the club on this order, because VS won't have
  // them in the member customer-group yet at the time this order is charged.
  const signupPromo = !isMember ? getSignupPromo() : null;
  const caseEligible =
    !isMember && caseBottles >= fullCaseCount && caseDiscountCode;
  const activePromoCode = caseEligible
    ? caseDiscountCode
    : signupPromo?.code ?? null;
  const isSignupPromoActive = !!signupPromo && activePromoCode === signupPromo.code;
  // UX rule:
  //   - JOINING the club on this order → deduct the member discount in the
  //     preview so the customer sees the immediate reward for joining (we
  //     forward a club-signup promo code to VS so the totals match).
  //   - Existing MEMBER → don't deduct; show as "potential savings" hint.
  //     Vinoshipper applies the customer-group discount at checkout and is
  //     the source of truth, so we never want our preview to disagree.
  //   - Guest → nothing.
  const discountActive = joiningClub;
  const showMemberSavingsHint = isMember && !joiningClub;
  // Bundles are excluded from member discount (matches Vinoshipper rule).
  const discountable = useMemo(() => discountEligibleSubtotal(items as any), [items]);
  // Members get 25% on full cases (12+ bottles), 20% otherwise — VS applies
  // the higher rate automatically via a non-stackable customer-group rule.
  // Member tier upgrade (25% on 12+ bottle cases) also uses the
  // case-eligible count so a sampler can't trigger the higher rate.
  const memberPct = memberDiscountPercent(caseBottles);
  const memberDiscount = useMemo(
    () => (discountActive ? discountable * (memberPct / 100) : 0),
    [discountActive, discountable, memberPct],
  );
  // Shipping ladder: 12+ bottles = included, 6–11 = flat $9.99,
  // <6 = Vinoshipper-calculated (shown as "calculated at checkout").
  const baseShipping =
    totalBottles >= VS_SHIPPING_THRESHOLD_BOTTLES
      ? 0
      : totalBottles >= VS_FLAT_SHIPPING_MIN_BOTTLES
        ? VS_FLAT_SHIPPING_USD
        : VS_FLAT_SHIPPING_USD; // under 6 still estimated at flat for the in-modal summary; VS recalculates at payment
  // UPS Access Point: $5 off home delivery, min $0
  const shipping =
    shipMethod === "ups_ap" ? Math.max(0, baseShipping - 5) : baseShipping;
  const tax = (subtotal - memberDiscount) * 0.07; // sim flat 7% — VS recalculates at checkout
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

  /**
   * LIVE handoff to Vinoshipper's hosted cart.
   * Card data and final shipping/tax are captured on vinoshipper.com — the
   * modal above is purely a branded review + age-gate. Opening the popup
   * synchronously inside the click preserves the user gesture so Safari /
   * Chrome don't silently block it.
   */
  const goToVinoshipperHostedCart = async () => {
    if (!ageOk) {
      toast.error("Please confirm you are 21 or older");
      return;
    }
    const wineLines = items.filter((i) => i.product.node.productKind === "wine");
    const vsLines = wineLines
      .map((i) => {
        const raw = (i.product.node as any).vinoshipperProductId;
        const pid = raw ? Number(raw) : NaN;
        return { productId: pid, quantity: i.quantity };
      })
      .filter((l) => Number.isFinite(l.productId) && l.quantity > 0);

    if (vsLines.length === 0) {
      toast.error("Wine checkout unavailable", {
        description: "This wine is missing its checkout mapping. Please refresh and try again.",
      });
      return;
    }

    const popup =
      typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;

    setSubmitting(true);
    try {
      // Stash A/B + GA attribution before VS takes over so the webhook can
      // stitch the resulting purchase back to the right arm.
      recordCheckoutIntent({ email: form.email || user?.email || null, cartId: null });
      await addLinesAndGoToHostedCart(vsLines, popup, activePromoCode);
      try { localStorage.setItem("rdw_returning_customer", "true"); } catch {}

      // DO NOT clear cart or claim success yet — the customer has only
      // been handed off to the secure payment tab. Switch into a waiting
      // state and let the poll effect confirm via the Vinoshipper
      // webhook before we touch their cart.
      setAwaitingPayment({
        handoffAt: new Date().toISOString(),
        email: (form.email || user?.email || "").trim().toLowerCase(),
        bottles: totalBottles,
        total,
        handoff: pendingMerchHandoff ?? null,
      });
      setAwaitingTimedOut(false);
    } catch (err: any) {
      try { popup?.close(); } catch {}
      console.error("[vs-handoff] failed", err);
      toast.error("Wine checkout unavailable", {
        description: "We couldn't load the secure cart. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
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
      const { error: logError } = await supabase.from("vinoshipper_webhook_logs").insert({
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
            ? {
                tier_id: clubTierId,
                discount_applied_percent: memberPct,
              }
            : null,
          totals: {
            subtotal: subtotal.toFixed(2),
            member_discount: memberDiscount.toFixed(2),
            shipping: shipping.toFixed(2),
            tax: tax.toFixed(2),
            total: total.toFixed(2),
          },
          promo_code: activePromoCode,
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
      if (logError) {
        // Logging is best-effort in simulation mode (RLS may block anonymous inserts).
        // Do NOT block the order flow — continue so the merch handoff can be tested.
        console.warn("[sim-order] could not write webhook log (continuing):", logError);
      }
      await markAbandonment("converted");
      if (isSignupPromoActive) markSignupPromoUsed();
      try { localStorage.setItem("rdw_returning_customer", "true"); } catch {}
      toast.success("Order placed (simulated)", {
        description: `Order ${fakeOrderId} — total $${total.toFixed(2)}`,
      });
      const bottlesForRedirect = totalBottles;
      const totalForRedirect = total;
      onWineOrderPlaced?.({
        orderId: fakeOrderId,
        total: totalForRedirect,
        bottles: bottlesForRedirect,
      });
      // Clear only wine items so merch stays in cart for the Shopify handoff.
      const wineLines = items.filter((i) => i.product.node.productKind === "wine");
      if (wineLines.length === items.length) {
        clearCart();
      } else {
        wineLines.forEach((i) => removeItem(i.variantId));
      }
      resetCheckoutIntent();
      if (pendingMerchHandoff) {
        // Stay open and show the merch handoff CTA — do NOT navigate.
        setMerchHandoffReady({
          orderId: fakeOrderId,
          total: totalForRedirect,
          bottles: bottlesForRedirect,
          handoff: pendingMerchHandoff,
        });
        // Pre-register a pending handoff row so the cron can email if abandoned.
        try {
          await supabase.from("pending_merch_handoffs").insert({
            user_id: user?.id ?? null,
            email: form.email,
            checkout_url: pendingMerchHandoff.checkoutUrl,
            items: pendingMerchHandoff.items as any,
            item_count: pendingMerchHandoff.itemCount,
            subtotal_cents: pendingMerchHandoff.subtotalCents,
            wine_order_id: fakeOrderId,
            status: "pending",
          });
        } catch (err) {
          console.warn("[merch-handoff] could not pre-register pending row", err);
        }
      } else {
        onOpenChange(false);
        navigate(
          `/thank-you?order=${encodeURIComponent(fakeOrderId)}&total=${totalForRedirect.toFixed(2)}&bottles=${bottlesForRedirect}`,
        );
      }
    } catch (e: any) {
      toast.error("Could not log simulated order", {
        description: e?.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Reset the handoff screen whenever the modal is reopened fresh.
  useEffect(() => {
    if (!open) {
      setMerchHandoffReady(null);
      setAwaitingPayment(null);
      setAwaitingTimedOut(false);
    }
  }, [open]);

  /**
   * Server-side confirmation poll for the wine handoff.
   *
   * While `awaitingPayment` is set we poll an edge function every 5s
   * (for up to 10 min) that checks `vinoshipper_webhook_logs` for an
   * ORDER:APPROVED/CREATED event matching this customer's email since
   * the handoff timestamp. Only when a real webhook lands do we:
   *   - clear wine items from the cart,
   *   - mark the abandonment converted,
   *   - transition into the merch handoff CTA (or close + toast).
   *
   * If the timeout elapses or the customer closes the modal first, the
   * wine items remain in the local cart so they're sent straight back
   * to their shopping cart to retry.
   */
  useEffect(() => {
    if (!awaitingPayment) return;
    let cancelled = false;
    const startedMs = new Date(awaitingPayment.handoffAt).getTime();
    const TIMEOUT_MS = 10 * 60 * 1000;
    const POLL_MS = 5_000;

    const onConfirmed = async () => {
      if (cancelled) return;
      try { await markAbandonment("converted"); } catch { /* non-fatal */ }
      const wineLines = items.filter((i) => i.product.node.productKind === "wine");
      if (wineLines.length === items.length) {
        clearCart();
      } else {
        wineLines.forEach((i) => removeItem(i.variantId));
      }
      const handoff = awaitingPayment.handoff;
      const fakeOrderId = `VS-${Date.now()}`;
      onWineOrderPlaced?.({
        orderId: fakeOrderId,
        total: awaitingPayment.total,
        bottles: awaitingPayment.bottles,
      });
      if (handoff) {
        setMerchHandoffReady({
          orderId: fakeOrderId,
          total: awaitingPayment.total,
          bottles: awaitingPayment.bottles,
          handoff,
        });
        setAwaitingPayment(null);
      } else {
        setAwaitingPayment(null);
        onOpenChange(false);
        toast.success("Wine order confirmed", {
          description: "We received your Vinoshipper order confirmation.",
        });
      }
    };

    const poll = async () => {
      if (cancelled) return;
      if (Date.now() - startedMs > TIMEOUT_MS) {
        setAwaitingTimedOut(true);
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke(
          "vinoshipper-confirm-recent-order",
          { body: { email: awaitingPayment.email, since: awaitingPayment.handoffAt } },
        );
        if (!cancelled && !error && (data as any)?.confirmed) {
          await onConfirmed();
          return;
        }
      } catch (e) {
        console.warn("[vs-confirm] poll failed", e);
      }
      if (!cancelled) setTimeout(poll, POLL_MS);
    };

    // First check after a short delay so the webhook has a chance to land
    // for instant-pay returning customers (Shop Pay / saved card).
    const t = setTimeout(poll, 3_000);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingPayment?.handoffAt]);

  const handleReturnToCart = () => {
    // Wine items are still in the cart — closing the modal returns the
    // shopper to the cart drawer where they can retry or remove items.
    setAwaitingPayment(null);
    setAwaitingTimedOut(false);
    onOpenChange(false);
  };

  /**
   * Pass through the Shopify cart checkoutUrl as-is.
   *
   * NOTE: Modern Shopify cart URLs (`/cart/c/<token>`) do NOT support
   * legacy `checkout[email]` / `checkout[shipping_address][...]` prefill
   * params — appending them caused the merch handoff (step 2) to fail to
   * load Shopify's checkout. Shopify's checkout will collect email + ship
   * address; Shop Pay still auto-recognizes returning customers by email.
   */
  const buildPrefilledMerchUrl = (baseUrl: string): string => {
    return baseUrl;
  };

  const handleContinueToMerch = () => {
    if (!merchHandoffReady) return;
    const handoff = merchHandoffReady.handoff;
    const prefilledUrl = buildPrefilledMerchUrl(handoff.checkoutUrl);
    // Fresh user gesture — popups are allowed here.
    const win = window.open(prefilledUrl, "_blank");
    if (!win) {
      // Popup blocked — fall back to same-tab nav.
      window.location.href = prefilledUrl;
      return;
    }
    onOpenChange(false);
    navigate(
      `/thank-you?order=${encodeURIComponent(merchHandoffReady.orderId)}&total=${merchHandoffReady.total.toFixed(2)}&bottles=${merchHandoffReady.bottles}&merch_pending=1`,
    );
  };

  // NOTE: We previously auto-redirected same-tab to the Shopify cart
  // checkoutUrl after a 3s countdown. That broke for customers whose
  // Shopify domain (gear.rescuedog.com) refused the same-tab connection,
  // leaving them stranded on a browser error page with no way back.
  // The merch handoff now requires a manual click (which opens a new tab
  // via a fresh user gesture), so the user always retains the modal as a
  // fallback if Shopify fails to load.

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 flex flex-col">
        {awaitingPayment ? (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Lock className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                Waiting for Vinoshipper
              </span>
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-xl">Finish your wine order</h2>
              <p className="text-sm text-muted-foreground">
                Your secure payment tab is open on vinoshipper.com. As soon
                as your order is approved we'll confirm it here automatically —
                you don't need to do anything else in this window.
              </p>
            </div>
            {!awaitingTimedOut ? (
              <div className="flex items-center gap-3 border border-border bg-muted/30 p-3 text-xs">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Listening for your payment confirmation…</span>
              </div>
            ) : (
              <div className="border border-border bg-muted/30 p-3 text-xs space-y-2">
                <div className="font-semibold">We haven't seen your order yet.</div>
                <p className="text-muted-foreground">
                  If you didn't complete payment on Vinoshipper, your wine is
                  still in your cart — just return and try again.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleReturnToCart}
              >
                Return to cart
              </Button>
              {awaitingTimedOut && (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    setAwaitingTimedOut(false);
                    setAwaitingPayment((p) =>
                      p ? { ...p, handoffAt: new Date().toISOString() } : p,
                    );
                  }}
                >
                  Keep waiting
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              If you've already paid, this will update on its own within a
              minute. You can safely close this window — we'll email you a
              confirmation either way.
            </p>
          </div>
        ) : merchHandoffReady ? (
          (() => {
            const handoff = merchHandoffReady.handoff;
            return (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                Wine order placed
              </span>
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-xl">One more step — your merch</h2>
              <p className="text-sm text-muted-foreground">
                Wine ships from our licensed partner. Your {handoff.itemCount}{" "}
                merch item{handoff.itemCount === 1 ? "" : "s"} check out separately
                through our secure merch checkout.
              </p>
            </div>
            <div className="border border-border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <ShoppingBag className="h-4 w-4" /> Merch total
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {handoff.itemCount} item{handoff.itemCount === 1 ? "" : "s"}
                </span>
                <span className="font-bold">
                  ${(handoff.subtotalCents / 100).toFixed(2)}
                </span>
              </div>
            </div>
            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={handleContinueToMerch}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Continue to merch checkout
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Opens in a new tab. If you don't complete it, we'll email a one-tap link to finish later.
            </p>
          </div>
            );
          })()
        ) : (
        <>
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
            {liveMode
              ? "Review your bottles. Payment & shipping details are captured on Vinoshipper's secure cart for compliance."
              : "Wine orders are processed by Vinoshipper for compliance & payment. In simulation mode no card is charged."}
          </DialogDescription>
        </DialogHeader>

        {!liveMode && (
          <>
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
          </>
        )}

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
              label={`Club join discount (${memberPct}%)`}
              value={-memberDiscount}
              accent
            />
          )}
          {showMemberSavingsHint && (
            <div className="flex justify-between text-[11px] uppercase tracking-brand text-primary">
              <span>
                Member savings ({memberPct}%)
              </span>
              <span className="font-bold">
                ~${(discountable * memberPct / 100).toFixed(2)} applied at checkout
              </span>
            </div>
          )}
          {activePromoCode && (
            <div className="flex justify-between text-[11px] uppercase tracking-brand text-green-700 dark:text-green-400">
              <span>{isSignupPromoActive ? "Newsletter code applied" : "Promo code applied"}</span>
              <span className="font-mono font-bold">{activePromoCode}</span>
            </div>
          )}
          <Row
            label={
              shipping === 0
                ? `Shipping (${shipMethod === "ups_ap" ? "UPS Access Point" : `included, ${VS_SHIPPING_THRESHOLD_BOTTLES}+ bottles`})`
                : shipMethod === "ups_ap"
                  ? "Shipping (UPS Access Point — save $5)"
                  : totalBottles >= VS_FLAT_SHIPPING_MIN_BOTTLES
                    ? `Shipping (flat $${VS_FLAT_SHIPPING_USD.toFixed(2)} — add ${VS_SHIPPING_THRESHOLD_BOTTLES - totalBottles} more for included)`
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

        {/* Ship to — simulation only. Live mode collects on Vinoshipper. */}
        {!liveMode && (
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
        )}

        {/* Shipping method — simulation only. */}
        {!liveMode && (
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
        )}

        {liveMode ? (
          <div className="border border-border bg-muted/20 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Lock className="h-3.5 w-3.5" /> Secure payment on Vinoshipper
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Card, shipping address, and final tax are captured on
              vinoshipper.com — our licensed compliance & payment partner.
              You'll be handed off when you continue.
            </p>
          </div>
        ) : (
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
        )}

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

        <WineShippingPolicy variant="full" />
        </div>

        {/* Sticky bottom CTA — thumb reach on mobile */}
        <div className="absolute bottom-0 inset-x-0 bg-background border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            onClick={liveMode ? goToVinoshipperHostedCart : placeOrder}
            disabled={submitting || items.length === 0 || !ageOk}
            size="lg"
            className="w-full"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : liveMode ? (
              <>
                <Lock className="h-4 w-4 mr-2" />
                Continue to secure payment — ${subtotal.toFixed(2)}
              </>
            ) : (
              `Place order — $${total.toFixed(2)}`
            )}
          </Button>
        </div>
        </>
        )}
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