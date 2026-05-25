import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Heart, Users, Gift, Percent, AlertTriangle, Loader2, ShoppingCart, Hourglass } from "lucide-react";
import { useIsMember } from "@/hooks/useIsMember";
import { PostPurchaseUpsell } from "@/components/PostPurchaseUpsell";
import { recordExperimentRevenueForVisitor } from "@/lib/experimentRevenue";
import { trackPurchase } from "@/lib/metaPixel";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";

const PENDING_WINE_CONFIRM_KEY = "rdw_pending_wine_confirm";
type WineConfirmState = "idle" | "polling" | "confirmed" | "missing";

export default function ThankYouPage() {
  const [params] = useSearchParams();
  const orderId = params.get("order") || params.get("vs_order") || "";
  const total = params.get("total");
  const bottles = Number(params.get("bottles") || 0);
  const { isMember } = useIsMember();
  const lastStore = (typeof window !== "undefined" && sessionStorage.getItem("lastStorePath")) || "/wines";

  // Poll Vinoshipper-confirm edge function to see whether the customer
  // actually completed the wine purchase after we handed off. If we don't
  // see a webhook within ~30s, nudge them back into the wine checkout.
  const [wineConfirm, setWineConfirm] = useState<WineConfirmState>("idle");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // Surface any items still sitting in the local cart — wine OR merch.
  // If the customer bailed mid-checkout and lands back on /thank-you
  // (refresh, back button, return URL), we remind them what's unfinished.
  const cartItems = useCartStore((s) => s.items);
  const pendingWineItems = cartItems.filter(
    (i) => i.product.node.productKind === "wine",
  );
  const pendingMerchItems = cartItems.filter(
    (i) => i.product.node.productKind !== "wine",
  );
  const pendingWineCount = pendingWineItems.reduce((s, i) => s + i.quantity, 0);
  const pendingMerchCount = pendingMerchItems.reduce((s, i) => s + i.quantity, 0);
  const reopenCart = () => {
    try { window.dispatchEvent(new CustomEvent("rdw:open-cart")); } catch {}
  };

  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(PENDING_WINE_CONFIRM_KEY); } catch {}
    if (!raw) return;
    let parsed: { email?: string; handoffAt?: string } | null = null;
    try { parsed = JSON.parse(raw); } catch {}
    if (!parsed?.email || !parsed.handoffAt) return;

    setPendingEmail(parsed.email);
    setWineConfirm("polling");
    let cancelled = false;
    let attempts = 0;
    const MAX = 10;
    const INTERVAL = 3000;

    const poll = async () => {
      while (!cancelled && attempts < MAX) {
        attempts++;
        try {
          const { data, error } = await supabase.functions.invoke(
            "vinoshipper-confirm-recent-order",
            { body: { email: parsed!.email, since: parsed!.handoffAt } },
          );
          if (!cancelled && !error && (data as any)?.confirmed) {
            setWineConfirm("confirmed");
            try { localStorage.removeItem(PENDING_WINE_CONFIRM_KEY); } catch {}
            return;
          }
        } catch (e) {
          console.warn("[wine-confirm] poll failed", e);
        }
        await new Promise((r) => setTimeout(r, INTERVAL));
      }
      if (!cancelled) setWineConfirm("missing");
    };

    poll();
    return () => { cancelled = true; };
  }, []);

  const resumeWineCheckout = () => {
    // Reopen cart drawer — the wine items were cleared on optimistic
    // handoff, so route them back to the shop to re-add.
    window.location.href = "/wines";
  };

  // Fire conversion events (GA4 + Meta CAPI hook is set up via metaAttribution)
  useEffect(() => {
    try {
      // @ts-ignore
      window.dataLayer = window.dataLayer || [];
      // @ts-ignore
      window.dataLayer.push({
        event: "purchase",
        ecommerce: {
          transaction_id: orderId,
          value: total ? Number(total) : undefined,
          currency: "USD",
          items_quantity: bottles,
        },
      });
    } catch {}
    // Browser-side Meta Pixel Purchase — uses same event_id as the server
    // CAPI Purchase so Meta dedupes. Once legacy checkout is retired and
    // orders flow through this site, this fires alongside the server event
    // and lifts EMQ via `_fbp`/`_fbc` browser cookies.
    if (orderId && total) {
      const dedupeKey = `rdw_meta_purchase_${orderId}`;
      if (!sessionStorage.getItem(dedupeKey)) {
        sessionStorage.setItem(dedupeKey, "1");
        trackPurchase({ eventId: orderId, value: Number(total) || 0, currency: "USD" });
      }
    }
    // Feed revenue back to every running experiment this visitor saw, so
    // the bandit can optimize on actual revenue-per-visitor.
    if (orderId) {
      const cents = Math.round((Number(total) || 0) * 100);
      const dedupeKey = `rdw_exp_rev_${orderId}`;
      if (cents > 0 && !sessionStorage.getItem(dedupeKey)) {
        sessionStorage.setItem(dedupeKey, "1");
        recordExperimentRevenueForVisitor(cents, "purchase", { orderId, bottles }).catch(() => {});
      }
    }
  }, [orderId, total, bottles]);

  const dogsHelped = Math.max(1, Math.floor(bottles / 4));

  // "Pending" if we're still waiting on the wine webhook, we never saw it,
  // or there are still un-checked-out items sitting in the cart.
  const isPending =
    wineConfirm === "polling" ||
    wineConfirm === "missing" ||
    pendingWineCount > 0 ||
    pendingMerchCount > 0;

  // Two distinct pending shapes — communicate them differently:
  //   • "system_delay"  → we're actively polling the compliance partner;
  //                       the customer may have finished and we just
  //                       haven't seen the webhook yet (often <2 min).
  //   • "needs_action"  → customer still has items in the cart, or our
  //                       polling window expired without a webhook —
  //                       they likely need to finish checkout themselves.
  const pendingReason: "none" | "system_delay" | "needs_action" =
    !isPending
      ? "none"
      : pendingWineCount > 0 || pendingMerchCount > 0 || wineConfirm === "missing"
        ? "needs_action"
        : "system_delay";

  return (
    <div className="min-h-dvh flex flex-col">
      <Seo title={isPending ? "Order Pending" : "Thank You"} path="/thank-you" noindex description="Order status — thanks for helping rescue dogs." />
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          {isPending ? (
            <div className="relative inline-block mx-auto mb-4">
              <ShoppingCart className="h-16 w-16 text-primary" />
              <Hourglass className="h-7 w-7 text-primary absolute -top-1 -right-2 bg-background p-0.5" />
            </div>
          ) : (
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
          )}
          <h1 className="font-display text-3xl md:text-4xl font-bold uppercase mb-2">
            {isPending ? "Order Pending" : "Order Confirmed"}
          </h1>
          {orderId && <p className="text-muted-foreground mb-2">Order #{orderId}</p>}
          <p className="text-foreground leading-relaxed mb-8">
            {pendingReason === "system_delay" && (
              <>
                Thanks for ordering. We're confirming your order with our payment &amp; compliance partner —
                this usually clears within a couple of minutes. If you've already completed payment, you're all set;
                your confirmation email will arrive shortly. No need to refresh.
              </>
            )}
            {pendingReason === "needs_action" && (
              <>
                Thanks for ordering. We don't yet see a completed payment for part of your order. This can happen for
                two reasons:
                {" "}
                <strong>(1) a brief system delay</strong> from our payment &amp; compliance partner — give it a minute
                and refresh; or
                {" "}
                <strong>(2) checkout wasn't finished</strong> — use the button below to complete it now.
              </>
            )}
            {pendingReason === "none" &&
              "Thanks for ordering — your bottles are on the way. A confirmation email is being sent to you now."}
          </p>

          {bottles > 0 && (
            <div className="border border-primary/30 bg-primary/5 p-4 mb-8">
              <Heart className="h-6 w-6 text-primary mx-auto mb-2" />
              <p className="text-sm">
                <strong>You just helped {dogsHelped} rescue dog{dogsHelped === 1 ? "" : "s"}.</strong>
                <br />
                <span className="text-muted-foreground">50% of profits support animal rescue partners across the country.</span>
              </p>
            </div>
          )}

          {orderId && <PostPurchaseUpsell orderId={orderId} />}

          {wineConfirm === "polling" && (
            <aside className="border border-border bg-muted/30 p-4 my-6 text-left flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Confirming your wine order with our compliance partner…
              </p>
            </aside>
          )}

          {wineConfirm === "missing" && (
            <aside className="border border-primary bg-primary/5 p-5 my-6 text-left">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                <p className="font-bold uppercase tracking-brand text-sm">
                  Your wine order isn't confirmed yet
                </p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                We didn't see a completed wine payment{pendingEmail ? ` for ${pendingEmail}` : ""}.
                If you closed the secure payment tab, you can pick up where you left off.
              </p>
              <Button
                size="sm"
                onClick={resumeWineCheckout}
                className="uppercase tracking-brand text-xs font-bold"
              >
                Complete wine purchase →
              </Button>
            </aside>
          )}

          {(pendingWineCount > 0 || pendingMerchCount > 0) && (
            <aside className="border border-primary bg-primary/5 p-5 my-6 text-left">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                <p className="font-bold uppercase tracking-brand text-sm">
                  You still have items waiting to check out
                </p>
              </div>
              <ul className="text-sm text-muted-foreground leading-relaxed mb-4 list-disc pl-5">
                {pendingWineCount > 0 && (
                  <li>
                    {pendingWineCount} wine bottle{pendingWineCount === 1 ? "" : "s"} —
                    finish with our compliance partner.
                  </li>
                )}
                {pendingMerchCount > 0 && (
                  <li>
                    {pendingMerchCount} merch item{pendingMerchCount === 1 ? "" : "s"} —
                    finish on our merch checkout.
                  </li>
                )}
              </ul>
              <Button
                size="sm"
                onClick={reopenCart}
                className="uppercase tracking-brand text-xs font-bold"
              >
                Open my cart →
              </Button>
            </aside>
          )}

          {/* Pack savings retro-look — non-members only, wine orders */}
          {!isMember && bottles > 0 && total && Number(total) > 0 && (
            <aside className="border border-primary bg-primary/5 p-5 my-6 text-left">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="h-5 w-5 text-primary" />
                <p className="font-bold uppercase tracking-brand text-sm">Wine Club members would have saved</p>
              </div>
              <p className="text-2xl font-display font-bold text-primary mb-1">
                ${(Number(total) * 0.20).toFixed(2)} on this order
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Join The Pack and lock in 20% off every bottle, first access to new releases, and members-only allocations.
              </p>
              <Button asChild size="sm" className="uppercase tracking-brand text-xs font-bold">
                <Link to="/club">Join The Pack →</Link>
              </Button>
            </aside>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {!isMember && (
              <Link to="/club" className="group border border-border p-5 text-left hover:border-primary transition-colors">
                <Users className="h-5 w-5 text-primary mb-2" />
                <div className="font-bold uppercase tracking-brand text-sm mb-1">Join the Wine Club</div>
                <div className="text-xs text-muted-foreground">20% off everything, shipping included on club shipments.</div>
              </Link>
            )}
            <Link to="/ambassadors" className="group border border-border p-5 text-left hover:border-primary transition-colors">
              <Gift className="h-5 w-5 text-primary mb-2" />
              <div className="font-bold uppercase tracking-brand text-sm mb-1">Refer a friend</div>
              <div className="text-xs text-muted-foreground">Earn rewards every time a friend orders. Become a Rescue Ambassador.</div>
            </Link>
          </div>

          <Button asChild variant="outline" size="lg" className="uppercase tracking-brand text-sm font-bold">
            <Link to={lastStore}>Keep shopping</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}