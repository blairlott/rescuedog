import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ShoppingCart, Minus, Plus, Trash2, ExternalLink, Loader2, History, ChevronDown, ArrowLeft } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useCartStore } from "@/stores/cartStore";
import { FreeShippingBar } from "@/components/cart/FreeShippingBar";
import { useCartSettings } from "@/hooks/useCartSettings";
import { CartUpsellBanner } from "@/components/cart/CartUpsellBanner";
import { CartRecommendations } from "@/components/cart/CartRecommendations";
import { CartSubscribeToggle } from "@/components/cart/CartSubscribeToggle";
import { CartWineClubUpsell } from "@/components/cart/CartWineClubUpsell";
import { VinoshipperCheckoutModal } from "@/components/cart/VinoshipperCheckoutModal";
import { DualCheckoutNotice } from "@/components/cart/DualCheckoutNotice";
import { DualCheckoutConfirm } from "@/components/cart/DualCheckoutConfirm";
import { useGeo } from "@/hooks/useGeo";
import { useTranslation } from "react-i18next";
import { CartTrustBlock } from "@/components/cart/CartTrustBlock";
import { CartGiftToggle } from "@/components/cart/CartGiftToggle";
import { CartSaveForLater } from "@/components/cart/CartSaveForLater";
import { CartLineExtras } from "@/components/cart/CartLineExtras";
import { CartGiftMode, readGiftMode, isGiftModeReady } from "@/components/cart/CartGiftMode";
import { useGiftWrapSettings } from "@/hooks/useGiftWrapSettings";
import { useIsMember } from "@/hooks/useIsMember";
import { Percent } from "lucide-react";
import { effectiveBottleCount, discountEligibleSubtotal } from "@/lib/wineBundles";
import { RescueSpotlightCard } from "@/components/rescue/RescueSpotlightCard";
import { ShopifyHandoffInterstitial } from "@/components/cart/ShopifyHandoffInterstitial";
import { CartLineSizePicker } from "@/components/cart/CartLineSizePicker";
import { addLinesAndGoToHostedCart } from "@/lib/vinoshipperInjector";
import { supabase } from "@/integrations/supabase/client";

const LAST_ORDER_KEY = "rdw_last_order";
const PENDING_WINE_KEY = "rdw_pending_wine_checkout";
const PENDING_WINE_TTL_MS = 60 * 60 * 1000; // 1h — abandoned sessions don't auto-reopen days later

/**
 * Lightweight telemetry hook for the dual-checkout flow. Always logs to the
 * console, and pushes to window.dataLayer when GTM is wired up so we can chart
 * popup-blocked rate, resume success, mismatch, and expiry over time.
 */
const logCheckoutEvent = (event: string, data: Record<string, unknown> = {}) => {
  try {
    // eslint-disable-next-line no-console
    console.info(`[checkout] ${event}`, data);
    const w = window as unknown as { dataLayer?: Array<Record<string, unknown>> };
    if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event: `rdw_checkout_${event}`, ...data });
    }
  } catch {
    // never let telemetry break checkout
  }
};

type WineSnapshotLine = { variantId: string; quantity: number };
type WineSnapshot = { lines: WineSnapshotLine[]; savedAt: string };

const snapshotWineLines = (wineItems: { variantId: string; quantity: number }[]): WineSnapshot => ({
  lines: wineItems
    .map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId)),
  savedAt: new Date().toISOString(),
});

const wineSnapshotsMatch = (a: WineSnapshotLine[], b: WineSnapshotLine[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].variantId !== b[i].variantId || a[i].quantity !== b[i].quantity) return false;
  }
  return true;
};

export const CartDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [vsCheckoutOpen, setVsCheckoutOpen] = useState(false);
  const [dualConfirmOpen, setDualConfirmOpen] = useState(false);
  const [shopifyHandoffOpen, setShopifyHandoffOpen] = useState(false);
  const pendingShopifyUrlRef = useRef<string | null>(null);
  // Surfaces a manual "Resume wine checkout" button as a fallback whenever
  // the auto-resume bailed (snapshot mismatch, expired, or user dismissed
  // the toast before clicking the action).
  const [manualResumeAvailable, setManualResumeAvailable] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { purchaseAllowed, setOverrideUS } = useGeo();
  const { t } = useTranslation();
  const isMerchRoute = location.pathname.startsWith("/merch");
  const { items, isLoading, isSyncing, updateQuantity, removeItem, syncCart, addItem, getShopifyCheckoutUrl, clearCart } = useCartStore();
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + (parseFloat(item.price.amount) * item.quantity), 0);
  // Split cart into wine + merch groups so each can check out via the right
  // path (Vinoshipper compliance for wine, our merch flow for everything else).
  const wineItems = items.filter(i => i.product.node.productKind === "wine");
  const merchItems = items.filter(i => i.product.node.productKind !== "wine");
  const wineTotal = wineItems.reduce((s, i) => s + parseFloat(i.price.amount) * i.quantity, 0);
  const merchSubtotal = merchItems.reduce((s, i) => s + parseFloat(i.price.amount) * i.quantity, 0);
  const giftMode = readGiftMode();
  const { enabled: wrapAvailable, feeCents: wrapFeeCents } = useGiftWrapSettings();
  const wrapFee = wrapAvailable && giftMode.enabled && giftMode.wrap ? wrapFeeCents / 100 : 0;
  const merchTotal = merchSubtotal + wrapFee;
  // Bundles (Mother's Day 6 Pack / 6-Bottle Sampler) count as 6 bottles for
  // the shipping-included threshold and are excluded from member discounts —
  // matches Vinoshipper's "Excluded from Discounts" rule.
  const totalBottlesEffective = isMerchRoute ? totalItems : effectiveBottleCount(items as any);
  const { freeShippingBottleCount, merchFreeShippingThreshold, fullCaseCount, fullCaseDiscount } = useCartSettings();
  const shippingIncluded = isMerchRoute
    ? totalPrice >= merchFreeShippingThreshold
    : totalBottlesEffective >= freeShippingBottleCount;
  const { isMember, discountPercent } = useIsMember();
  const discountableSubtotal = !isMerchRoute ? discountEligibleSubtotal(items as any) : totalPrice;
  const memberSavings = !isMerchRoute && isMember ? discountableSubtotal * (discountPercent / 100) : 0;
  const bottlesNeeded = freeShippingBottleCount - totalBottlesEffective;
  const dollarsNeeded = Math.max(0, merchFreeShippingThreshold - totalPrice);
  const showNudge = !isMerchRoute && !shippingIncluded && bottlesNeeded > 0 && bottlesNeeded <= 2 && totalItems > 0;
  const showMerchNudge = isMerchRoute && !shippingIncluded && dollarsNeeded > 0 && dollarsNeeded <= 25 && totalItems > 0;
  const bottlesToCase = !isMerchRoute && totalBottlesEffective > 0 && totalBottlesEffective < fullCaseCount
    ? fullCaseCount - totalBottlesEffective
    : 0;
  // Project the dollar savings the user unlocks by topping up to a full
  // case. Uses the heavier of public case discount vs. member rate.
  const effectiveCaseDiscountPct = isMember ? discountPercent : fullCaseDiscount;
  const avgWineBottlePrice = wineItems.length
    ? wineTotal / Math.max(1, wineItems.reduce((s, i) => s + i.quantity, 0))
    : 0;
  const caseTopUpSavings = bottlesToCase > 0 && avgWineBottlePrice > 0
    ? (wineTotal + avgWineBottlePrice * bottlesToCase) * (effectiveCaseDiscountPct / 100)
    : 0;

  const lastOrder: { items: any[] } | null = (() => {
    try { const raw = localStorage.getItem(LAST_ORDER_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  })();

  useEffect(() => { if (isOpen) syncCart(); }, [isOpen, syncCart]);

  // Global "open cart" event — used by Buy Now buttons across the site.
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener("rdw:open-cart", handler);
    return () => window.removeEventListener("rdw:open-cart", handler);
  }, []);

  // Guard so resume logic runs at most once per page visit, even if
  // pageshow + visibilitychange + mount all fire in quick succession.
  const resumeAttemptedRef = useRef(false);

  // Resume wine checkout after a same-tab Shopify handoff.
  // When popup was blocked, handleSmartCheckout sets rdw_pending_wine_checkout
  // and navigates this tab to Shopify. On return (back button, return URL, or
  // tab refocus), pick up where we left off and open the VS modal.
  useEffect(() => {
    const resumeIfPending = () => {
      if (resumeAttemptedRef.current) return;
      let raw: string | null = null;
      try { raw = localStorage.getItem(PENDING_WINE_KEY); } catch {}
      if (!raw) return;
      // Mark attempted as soon as we see a pending flag — even if we bail
      // out below (no wine, snapshot mismatch), we don't want another event
      // to retrigger this in the same visit.
      resumeAttemptedRef.current = true;

      let snapshot: WineSnapshot | null = null;
      try {
        const parsed = JSON.parse(raw);
        // Tolerate the legacy "1" flag — treat as no snapshot to compare against.
        if (parsed && Array.isArray(parsed.lines)) snapshot = parsed as WineSnapshot;
      } catch {}

      // Always clear the flag — we only get one chance to resume.
      try { localStorage.removeItem(PENDING_WINE_KEY); } catch {}

      const currentWine = useCartStore.getState().items.filter(
        (i) => i.product.node.productKind === "wine",
      );
      if (currentWine.length === 0) {
        logCheckoutEvent("resume_skipped_no_wine");
        return;
      }

      // Expire stale snapshots — if the user came back hours/days later,
      // surface the manual button instead of silently popping a modal.
      if (snapshot?.savedAt) {
        const ageMs = Date.now() - new Date(snapshot.savedAt).getTime();
        if (Number.isFinite(ageMs) && ageMs > PENDING_WINE_TTL_MS) {
          logCheckoutEvent("resume_expired", { ageMs });
          setManualResumeAvailable(true);
          return;
        }
      }

      // If we have a snapshot, require the wine cart to match exactly.
      // If items were added/removed/quantities changed since handoff, do not
      // auto-reopen — the user can hit Checkout again.
      if (snapshot) {
        const currentSnapshot = snapshotWineLines(currentWine);
        if (!wineSnapshotsMatch(snapshot.lines, currentSnapshot.lines)) {
          logCheckoutEvent("resume_mismatch", {
            snapshotLines: snapshot.lines.length,
            currentLines: currentSnapshot.lines.length,
          });
          setManualResumeAvailable(true);
          // Cart changed — let the user decide instead of silently reopening.
          toast("Wine cart changed since merch checkout", {
            id: "rdw-wine-resume-mismatch",
            description: "Review your bottles, then continue when ready.",
            duration: 8000,
            action: {
              label: "Continue wine checkout",
              onClick: () => {
                setIsOpen(false);
                setVsCheckoutOpen(true);
              },
            },
          });
          return;
        }
      }

      logCheckoutEvent("resume_success", {
        bottles: currentWine.reduce((s, i) => s + i.quantity, 0),
      });
      toast.success("Wine checkout resumed", {
        id: "rdw-wine-resume-success",
        description: `Picking up ${currentWine.reduce((s, i) => s + i.quantity, 0)} bottle${currentWine.reduce((s, i) => s + i.quantity, 0) !== 1 ? "s" : ""} where you left off after merch.`,
        duration: 5000,
        action: {
          label: "Open wine checkout",
          onClick: () => {
            setIsOpen(false);
            setVsCheckoutOpen(true);
          },
        },
      });
      setIsOpen(false);
      setVsCheckoutOpen(true);
    };
    // Run on mount (covers full page reload / return URL navigation)
    resumeIfPending();
    // Run on tab refocus (covers back-button restore from bfcache)
    const onVisibility = () => {
      if (document.visibilityState === "visible") resumeIfPending();
    };
    const onPageShow = () => resumeIfPending();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const reorderLast = async () => {
    if (!lastOrder?.items?.length) return;
    for (const it of lastOrder.items) {
      await addItem({
        product: it.product,
        variantId: it.variantId,
        variantTitle: it.variantTitle,
        price: it.price,
        quantity: it.quantity,
        selectedOptions: it.selectedOptions ?? [],
      });
    }
  };

  const addCaseTopUp = async () => {
    // Bump the largest current line by the bottles needed to reach a case
    if (bottlesToCase <= 0 || items.length === 0) return;
    const target = [...items].sort((a, b) => b.quantity - a.quantity)[0];
    await updateQuantity(target.variantId, target.quantity + bottlesToCase);
  };

  const handleCheckoutWines = async () => {
    // Snapshot for "re-order last shipment"
    try { localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ items, savedAt: new Date().toISOString() })); } catch {}

    // Build Vinoshipper Injector lines from current wine cart. Each wine row
    // carries its numeric VS product ID (backfilled from the cart URL slug).
    const vsLines = wineItems
      .map((i) => {
        const raw = i.product.node.vinoshipperProductId;
        const pid = raw ? Number(raw) : NaN;
        return { productId: pid, quantity: i.quantity };
      })
      .filter((l) => Number.isFinite(l.productId) && l.quantity > 0);

    if (vsLines.length === 0) {
      toast.error("Wine checkout unavailable", {
        description: "This wine is missing its checkout mapping. Please refresh and try again.",
      });
      logCheckoutEvent("wine_injector_missing_product_ids");
      return;
    }

    // GIFT MODE: persist a pending intent so the Vinoshipper webhook can
    // match this order back to a recipient and fire branded gift emails.
    // We do this BEFORE redirecting because once we hand off to Vinoshipper
    // we lose the React context. Best-effort: never block checkout on failure.
    const liveGift = readGiftMode();
    if (liveGift.enabled) {
      if (!isGiftModeReady(liveGift)) {
        toast.error("Recipient email required", {
          description: "Gift Mode is on — please add the recipient's email so we can send their gift notifications.",
        });
        return;
      }
      try {
        const { data: authUser } = await supabase.auth.getUser();
        const bottleCount = wineItems.reduce((s, i) => s + i.quantity, 0);
        const subtotalCents = Math.round(wineTotal * 100);
        let vsCustomerId: string | null = null;
        let buyerName: string | null = null;
        let buyerEmail: string | null = authUser?.user?.email ?? null;
        if (authUser?.user?.id) {
          const { data: prof } = await supabase
            .from("customer_profiles")
            .select("vinoshipper_customer_id, full_name, email")
            .eq("id", authUser.user.id)
            .maybeSingle();
          vsCustomerId = (prof as any)?.vinoshipper_customer_id ?? null;
          buyerName = (prof as any)?.full_name ?? null;
          buyerEmail = buyerEmail ?? (prof as any)?.email ?? null;
        }
        const { error: intentErr } = await supabase
          .from("wine_order_gift_intents")
          .insert({
            buyer_user_id: authUser?.user?.id ?? null,
            buyer_email: buyerEmail,
            buyer_name: buyerName,
            vinoshipper_customer_id: vsCustomerId,
            recipient_name: liveGift.recipientName || "Friend",
            recipient_email: liveGift.recipientEmail.trim(),
            gift_message: liveGift.message || null,
            gift_wrap: !!liveGift.wrap,
            bottle_count: bottleCount,
            subtotal_cents: subtotalCents,
            source: "a_la_carte",
          });
        if (intentErr) {
          console.error("[gift-intent] insert failed", intentErr);
          logCheckoutEvent("gift_intent_insert_failed", { error: intentErr.message });
        } else {
          logCheckoutEvent("gift_intent_saved", { bottleCount, vsCustomerId });
        }
      } catch (e) {
        console.error("[gift-intent] exception", e);
      }
    }

    logCheckoutEvent("wine_injector_hosted_cart", { lines: vsLines.length });
    try {
      setIsOpen(false);
      await addLinesAndGoToHostedCart(vsLines);
    } catch (err) {
      console.error("[checkout] VS injector failed:", err);
      logCheckoutEvent("wine_injector_failed", { error: String(err) });
      toast.error("Wine checkout unavailable", {
        description: "We couldn't load the secure cart. Please refresh and try again.",
      });
    }
  };

  const handleCheckoutMerch = () => {
    // Real Shopify hosted checkout. If the URL hasn't synced yet, surface the
    // error rather than fabricating a fake order — checkout must be live.
    const url = getShopifyCheckoutUrl();
    if (!url) {
      toast.error("Checkout not ready", {
        description: "Cart is still syncing with the store. Try again in a moment.",
      });
      return;
    }
    try {
      localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ items: merchItems, savedAt: new Date().toISOString() }));
    } catch {}
    setIsOpen(false);
    window.location.href = url;
  };

  // Smart sequential checkout: combines wine (Vinoshipper) and merch
  // (Shopify) into a single click. When both are present, merch opens
  // in a new tab first, then the VS modal takes over the current tab.
  const hasWine = wineItems.length > 0;
  const hasMerch = merchItems.length > 0;
  const isDual = hasWine && hasMerch;

  const handleSmartCheckout = () => {
    if (hasMerch && !hasWine) {
      const url = getShopifyCheckoutUrl();
      if (url) {
        pendingShopifyUrlRef.current = url;
        setShopifyHandoffOpen(true);
      } else {
        handleCheckoutMerch();
      }
      return;
    }
    if (hasWine && !hasMerch) {
      handleCheckoutWines();
      return;
    }
    // Both: surface the compliance explainer first so the customer isn't
    // surprised by two tabs / two charges / two emails.
    setDualConfirmOpen(true);
  };

  // Fires once the branded interstitial finishes — opens Shopify in a new
  // tab, falls back to same-tab nav if the popup is blocked.
  const completeShopifyHandoff = () => {
    setShopifyHandoffOpen(false);
    const url = pendingShopifyUrlRef.current;
    pendingShopifyUrlRef.current = null;
    if (!url) return;
    logCheckoutEvent("merch_handoff_same_tab");
    setIsOpen(false);
    window.location.href = url;
  };

  const runDualCheckout = () => {
    setDualConfirmOpen(false);
    // WINE FIRST. Open Vinoshipper modal only — do NOT open Shopify yet.
    // After the wine order is placed, the VS modal renders a "Continue to
    // merch checkout" CTA. That click is a fresh user gesture, so the
    // Shopify popup is not blocked. If the customer closes the modal
    // without clicking, we already wrote a pending_merch_handoffs row so
    // the cron can email a one-tap link to finish the merch order.
    logCheckoutEvent("dual_wine_first_started", {
      wine_items: wineItems.length,
      merch_items: merchItems.length,
    });
    handleCheckoutWines();
  };

  return (
    <>
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <ShoppingCart className="h-5 w-5" />
          {totalItems > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-primary text-primary-foreground">
              {totalItems}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden p-4 sm:p-6">
        {/* Diagonal corner ribbon — communicates shipping threshold for both wine & merch */}
        {totalItems > 0 && (
          <div className="pointer-events-none absolute top-0 right-0 h-24 w-24 overflow-hidden z-20">
            <div
              className={`absolute top-[22px] right-[-42px] w-[150px] rotate-45 text-center py-1 text-[9px] font-bold uppercase tracking-brand shadow-md ${
                shippingIncluded
                  ? "bg-green-600 text-white"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {shippingIncluded
                ? "Shipping Included ✓"
                : isMerchRoute
                  ? `$${dollarsNeeded.toFixed(0)} to unlock`
                  : `${bottlesNeeded} to unlock`}
            </div>
          </div>
        )}
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="font-display">Shopping Cart</SheetTitle>
          <SheetDescription>
            {totalItems === 0 ? "Your cart is empty" : `${totalItems} item${totalItems !== 1 ? 's' : ''} in your cart`}
          </SheetDescription>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="mt-2 self-start uppercase tracking-brand text-xs font-bold h-8 px-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Continue shopping
          </Button>
          {!isMerchRoute && isMember && totalItems > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-brand px-2 py-1 rounded-sm w-fit">
              <Percent className="h-3 w-3" /> Member price applied at checkout — save ${memberSavings.toFixed(2)}
            </div>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pt-4 pr-1 min-h-0 overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
          {items.length === 0 ? (
            <div className="min-h-[50vh] flex items-center justify-center">
              <div className="text-center">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Your cart is empty</p>
                {lastOrder?.items?.length > 0 && (
                  <Button onClick={reorderLast} variant="outline" size="sm" className="mt-4 text-xs">
                    <History className="w-3.5 h-3.5 mr-1.5" />
                    Re-order your last shipment
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Free shipping progress bar */}
              <div className="sticky top-0 z-10 -mx-1 px-1 pt-1 pb-3 bg-background/95 backdrop-blur-sm">
                <FreeShippingBar
                  totalBottles={totalBottlesEffective}
                  cartTotal={totalPrice}
                  mode={isMerchRoute ? "merch" : "wine"}
                />
              </div>

              {/* Cart items */}
              <div>
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.variantId} className="p-3 rounded-md bg-card">
                      <div className="flex gap-4">
                        <div className="w-16 h-16 bg-muted rounded-md overflow-hidden flex-shrink-0">
                          {item.product.node.images?.edges?.[0]?.node && (
                            <img src={item.product.node.images.edges[0].node.url} alt={item.product.node.title} className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{item.product.node.title}</h4>
                          <p className="text-xs text-muted-foreground">{item.selectedOptions.map(o => o.value).join(' • ')}</p>
                          <CartLineSizePicker item={item} />
                          <p className="font-semibold text-sm mt-1">${parseFloat(item.price.amount).toFixed(2)}</p>
                          <CartLineExtras item={item} />
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(item.variantId)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.variantId, item.quantity - 1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm">{item.quantity}</span>
                            <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.variantId, item.quantity + 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <CartSubscribeToggle
                        price={parseFloat(item.price.amount)}
                        quantity={item.quantity}
                      />
                    </div>
                  ))}
                </div>

                {/* Upsell banners */}
                <div className="mt-4">
                  <CartUpsellBanner totalBottles={totalBottlesEffective} cartTotal={totalPrice} />
                </div>

                {/* Product cross-sells — always visible above the fold */}
                {totalItems > 0 && (
                  <div className="mt-4">
                    <CartRecommendations cartItems={items} cartTotal={totalPrice} />
                  </div>
                )}

                {/* Collapsed extras — keeps the checkout button reachable on mobile */}
                <Accordion type="single" collapsible className="mt-4">
                  <AccordionItem value="more" className="border-t border-b border-border">
                    <AccordionTrigger className="text-xs uppercase tracking-brand font-bold py-3 hover:no-underline">
                      More options
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-3">
                      {!isMerchRoute && <CartTrustBlock totalBottles={totalBottlesEffective} />}
                      <CartGiftToggle />
                      <CartSaveForLater />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>

              {/* Footer with total and checkout */}
              <div className="space-y-3 pt-4 border-t pb-2">
                {bottlesToCase > 0 && bottlesToCase <= 6 && (
                  <div className="bg-primary text-primary-foreground px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="leading-tight">
                      <p className="text-[11px] uppercase tracking-brand font-bold">
                        Make it a case · save {effectiveCaseDiscountPct}%
                      </p>
                      <p className="text-[10px] opacity-90">
                        Add {bottlesToCase} more bottle{bottlesToCase !== 1 ? "s" : ""}
                        {caseTopUpSavings > 0 ? ` — saves about $${caseTopUpSavings.toFixed(0)}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={addCaseTopUp}
                      className="h-8 text-[11px] px-3 bg-background text-foreground hover:bg-background/90 whitespace-nowrap font-bold"
                    >
                      +{bottlesToCase} bottles
                    </Button>
                  </div>
                )}
                <CartWineClubUpsell />
                {showNudge && (
                  <div className="text-xs bg-brand-gold/10 border border-brand-gold/30 px-3 py-2 flex items-center justify-between">
                    <span><strong>Add {bottlesNeeded} more bottle{bottlesNeeded !== 1 ? 's' : ''}</strong> — shipping included at {freeShippingBottleCount}+</span>
                  </div>
                )}
                {showMerchNudge && (
                  <div className="text-xs bg-brand-gold/10 border border-brand-gold/30 px-3 py-2 flex items-center justify-between">
                    <span><strong>${dollarsNeeded.toFixed(2)} to go</strong> — shipping included at ${merchFreeShippingThreshold}+</span>
                  </div>
                )}
                {merchItems.length > 0 && (
                  <CartGiftMode />
                )}
                {isDual && (
                  <DualCheckoutNotice
                    wineCount={wineItems.reduce((s, i) => s + i.quantity, 0)}
                    merchCount={merchItems.reduce((s, i) => s + i.quantity, 0)}
                    wineTotal={wineTotal}
                    merchTotal={merchTotal}
                  />
                )}
                {manualResumeAvailable && hasWine && (
                  <div className="text-xs bg-primary/10 border border-primary/30 px-3 py-2 flex items-center justify-between gap-2">
                    <span className="leading-tight">
                      <strong>Finished merch checkout?</strong> Resume your wine order.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] px-2 whitespace-nowrap"
                      onClick={() => {
                        logCheckoutEvent("manual_resume_clicked");
                        setManualResumeAvailable(false);
                        setIsOpen(false);
                        setVsCheckoutOpen(true);
                      }}
                    >
                      Resume wine
                    </Button>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-display font-semibold">Subtotal</span>
                    <span className="font-bold">${(totalPrice + wrapFee).toFixed(2)}</span>
                  </div>
                  {isDual && (
                    <div className="text-[11px] text-muted-foreground space-y-0.5 border-t border-dashed border-border pt-1.5">
                      <div className="flex justify-between">
                        <span>Step 1 · Merch ({merchItems.reduce((s,i)=>s+i.quantity,0)} item{merchItems.reduce((s,i)=>s+i.quantity,0)!==1?'s':''})</span>
                        <span className="font-mono">${merchTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Step 2 · Wine ({wineItems.reduce((s,i)=>s+i.quantity,0)} bottle{wineItems.reduce((s,i)=>s+i.quantity,0)!==1?'s':''})</span>
                        <span className="font-mono">${wineTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  {isMember && wineTotal > 0 && (
                    <p className="text-[11px] text-primary font-bold uppercase tracking-brand text-right">
                      Member savings: -${memberSavings.toFixed(2)}
                    </p>
                  )}
                  {!isMember && !isMerchRoute && discountableSubtotal > 0 && (
                    <div className="flex items-center justify-between gap-2 border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1.5">
                      <p className="text-[11px] leading-tight">
                        <span className="font-bold text-primary uppercase tracking-brand">Pack members save </span>
                        <span className="font-bold text-foreground">${(discountableSubtotal * 0.20).toFixed(2)}</span>
                        <span className="text-muted-foreground"> on this cart</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => { setIsOpen(false); navigate("/club"); }}
                        className="text-[10px] uppercase tracking-brand font-bold text-primary hover:underline whitespace-nowrap"
                      >
                        Join →
                      </button>
                    </div>
                  )}
                  {wrapFee > 0 && (
                    <p className="text-[11px] text-muted-foreground text-right">
                      Includes ${wrapFee.toFixed(2)} gift wrap
                    </p>
                  )}
                </div>
                {totalItems > 0 && (
                  <RescueSpotlightCard variant="compact" seed="cart" />
                )}
                {/* Smart sequential checkout — wine via VS, merch via Shopify */}
                <Button
                  onClick={handleSmartCheckout}
                  className="w-full bg-primary hover:bg-primary/90"
                  size="lg"
                  disabled={isLoading || isSyncing || !purchaseAllowed}
                  title={!purchaseAllowed ? t("geo.purchase_disabled_tooltip") : undefined}
                >
                  {isLoading || isSyncing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : !purchaseAllowed ? (
                    t("geo.checkout_disabled_label")
                  ) : isDual ? (
                    <>Checkout (2 steps) · ${(totalPrice + wrapFee).toFixed(2)}</>
                  ) : (
                    <>{t("common.checkout")} · ${(totalPrice + wrapFee).toFixed(2)}</>
                  )}
                </Button>
                {!purchaseAllowed && (
                  <div className="text-center space-y-1.5">
                    <p className="text-[10px] text-destructive leading-tight">
                      {t("geo.purchase_disabled_tooltip")}
                    </p>
                    <button
                      type="button"
                      onClick={() => setOverrideUS(true)}
                      className="text-[11px] uppercase tracking-brand font-bold underline text-foreground hover:text-primary"
                    >
                      {t("geo.shipping_to_us")}
                    </button>
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="w-full uppercase tracking-brand text-xs font-bold"
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  {t("common.continue_shopping")}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">
                  {isDual
                    ? "Merch pays in a new tab. Wine checkout opens here next. Two confirmations — one per order."
                    : hasWine
                      ? "Wine ships via our compliance partner, Vinoshipper."
                      : "Merch ships from our US fulfillment partners."}
                </p>

                <Accordion type="single" collapsible>
                  <AccordionItem value="legacy" className="border-0">
                    <AccordionTrigger className="text-[11px] uppercase tracking-brand text-muted-foreground py-1 hover:no-underline">
                      Use unified single-transaction checkout (beta)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pt-2">
                      <Button
                        onClick={() => { setIsOpen(false); navigate("/checkout"); }}
                        variant="outline"
                        className="w-full"
                        size="lg"
                        disabled={isLoading || isSyncing || !purchaseAllowed}
                      >
                        Try unified checkout · ${(totalPrice + wrapFee).toFixed(2)}
                      </Button>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        Combines wine + merch into one card form and one charge. Requires Vinoshipper Order API live mode.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
    <VinoshipperCheckoutModal
      open={vsCheckoutOpen}
      onOpenChange={setVsCheckoutOpen}
      pendingMerchHandoff={
        hasWine && hasMerch
          ? {
              checkoutUrl: getShopifyCheckoutUrl() ?? "",
              itemCount: merchItems.reduce((s, i) => s + i.quantity, 0),
              subtotalCents: Math.round(merchTotal * 100),
              items: merchItems.map((i) => ({
                handle: i.product.node.handle,
                title: i.product.node.title,
                variant_id: i.variantId,
                quantity: i.quantity,
                unit_price: parseFloat(i.price.amount),
              })),
            }
          : null
      }
      onWineOrderPlaced={({ orderId }) => {
        logCheckoutEvent("dual_wine_completed", { order_id: orderId });
      }}
    />
    <DualCheckoutConfirm
      open={dualConfirmOpen}
      onOpenChange={setDualConfirmOpen}
      onConfirm={runDualCheckout}
      wineCount={wineItems.reduce((s, i) => s + i.quantity, 0)}
      merchCount={merchItems.reduce((s, i) => s + i.quantity, 0)}
      wineTotal={wineTotal}
      merchTotal={merchTotal}
    />
    <ShopifyHandoffInterstitial
      open={shopifyHandoffOpen}
      onDone={completeShopifyHandoff}
    />
    </>
  );
};
