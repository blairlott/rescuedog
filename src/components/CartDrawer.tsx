import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ShoppingCart, Minus, Plus, Trash2, ExternalLink, Loader2, History, ChevronDown } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useCartStore } from "@/stores/cartStore";
import { FreeShippingBar } from "@/components/cart/FreeShippingBar";
import { useCartSettings } from "@/hooks/useCartSettings";
import { CartUpsellBanner } from "@/components/cart/CartUpsellBanner";
import { CartRecommendations } from "@/components/cart/CartRecommendations";
import { CartSubscribeToggle } from "@/components/cart/CartSubscribeToggle";
import { CartWineClubUpsell } from "@/components/cart/CartWineClubUpsell";
import { VinoshipperCheckoutModal } from "@/components/cart/VinoshipperCheckoutModal";
import { CartTrustBlock } from "@/components/cart/CartTrustBlock";
import { CartGiftToggle } from "@/components/cart/CartGiftToggle";
import { CartSaveForLater } from "@/components/cart/CartSaveForLater";
import { CartLineExtras } from "@/components/cart/CartLineExtras";
import { CartGiftMode, GIFT_WRAP_FEE_CENTS, readGiftMode } from "@/components/cart/CartGiftMode";
import { useIsMember } from "@/hooks/useIsMember";
import { Percent } from "lucide-react";
import { effectiveBottleCount, discountEligibleSubtotal } from "@/lib/wineBundles";

const LAST_ORDER_KEY = "rdw_last_order";

export const CartDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [vsCheckoutOpen, setVsCheckoutOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
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
  const wrapFee = giftMode.enabled && giftMode.wrap ? GIFT_WRAP_FEE_CENTS / 100 : 0;
  const merchTotal = merchSubtotal + wrapFee;
  // Bundles (Mother's Day 6 Pack / 6-Bottle Sampler) count as 6 bottles for
  // the shipping-included threshold and are excluded from member discounts —
  // matches Vinoshipper's "Excluded from Discounts" rule.
  const totalBottlesEffective = isMerchRoute ? totalItems : effectiveBottleCount(items as any);
  const { freeShippingBottleCount, merchFreeShippingThreshold, fullCaseCount } = useCartSettings();
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

  const lastOrder: { items: any[] } | null = (() => {
    try { const raw = localStorage.getItem(LAST_ORDER_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  })();

  useEffect(() => { if (isOpen) syncCart(); }, [isOpen, syncCart]);

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

  const handleCheckoutWines = () => {
    // Snapshot for "re-order last shipment"
    try { localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ items, savedAt: new Date().toISOString() })); } catch {}
    setIsOpen(false);
    setVsCheckoutOpen(true);
  };

  const handleCheckoutMerch = () => {
    // Simulated merch checkout — bypass Shopify hosted checkout for now and
    // walk the user through to the thank-you screen with a fake order ID so
    // the full UX can be evaluated end-to-end.
    const fakeOrderId = `MERCH-SIM-${Date.now()}`;
    const merchOnlyTotal = merchTotal;
    const merchUnits = merchItems.reduce((s, i) => s + i.quantity, 0);
    try {
      localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ items: merchItems, savedAt: new Date().toISOString() }));
    } catch {}
    // Drop merch lines but keep wine in cart if any.
    const remainingWine = wineItems;
    if (remainingWine.length === 0) {
      clearCart();
    } else {
      // remove each merch line locally
      merchItems.forEach((i) => removeItem(i.variantId));
    }
    setIsOpen(false);
    navigate(
      `/thank-you?order=${encodeURIComponent(fakeOrderId)}&total=${merchOnlyTotal.toFixed(2)}&bottles=0&units=${merchUnits}`,
    );
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
              <div className="flex-shrink-0 mb-3">
                <FreeShippingBar
                  totalBottles={totalItems}
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
                  <CartUpsellBanner totalBottles={totalItems} cartTotal={totalPrice} />
                </div>

                {/* Product recommendations — only when cart is small (avoid drawer bloat) */}
                {totalItems > 0 && totalItems <= 2 && (
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
                      {totalItems > 2 && (
                        <CartRecommendations cartItems={items} cartTotal={totalPrice} />
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>

              {/* Footer with total and checkout */}
              <div className="space-y-3 pt-4 border-t pb-2">
                {bottlesToCase > 0 && bottlesToCase <= 4 && (
                  <div className="text-xs bg-primary/10 border border-primary/30 px-3 py-2 flex items-center justify-between gap-2">
                    <span>
                      <strong>Add {bottlesToCase} more</strong> to unlock the case discount
                    </span>
                    <Button size="sm" variant="outline" onClick={addCaseTopUp} className="h-6 text-[11px] px-2">
                      +{bottlesToCase}
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
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-display font-semibold">Subtotal</span>
                    <span className="font-bold">${(totalPrice + wrapFee).toFixed(2)}</span>
                  </div>
                  {isMember && wineTotal > 0 && (
                    <p className="text-[11px] text-primary font-bold uppercase tracking-brand text-right">
                      Member savings: -${memberSavings.toFixed(2)}
                    </p>
                  )}
                  {wrapFee > 0 && (
                    <p className="text-[11px] text-muted-foreground text-right">
                      Includes ${wrapFee.toFixed(2)} gift wrap
                    </p>
                  )}
                </div>
                {wineItems.length > 0 && (
                  <Button onClick={handleCheckoutWines} className="w-full bg-primary hover:bg-primary/90" size="lg" disabled={isLoading || isSyncing}>
                    {isLoading || isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <><ExternalLink className="w-4 h-4 mr-2" /> Checkout {wineItems.length} wine{wineItems.length !== 1 ? "s" : ""} · ${wineTotal.toFixed(2)}</>
                    )}
                  </Button>
                )}
                {merchItems.length > 0 && (
                  <Button onClick={handleCheckoutMerch} variant={wineItems.length > 0 ? "outline" : "default"} className={`w-full ${wineItems.length === 0 ? "bg-primary hover:bg-primary/90" : ""}`} size="lg" disabled={isLoading || isSyncing}>
                    <ExternalLink className="w-4 h-4 mr-2" /> Checkout {merchItems.length} merch · ${merchTotal.toFixed(2)}
                  </Button>
                )}
                {wineItems.length > 0 && merchItems.length > 0 && (
                  <p className="text-[10px] text-muted-foreground text-center leading-tight">
                    Wine ships via our compliance partner Vinoshipper; merch ships from our US fulfillment partners. Two checkouts, one cart.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
    <VinoshipperCheckoutModal open={vsCheckoutOpen} onOpenChange={setVsCheckoutOpen} />
    </>
  );
};
