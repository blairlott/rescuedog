import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Heart, Users, Gift, Percent } from "lucide-react";
import { useIsMember } from "@/hooks/useIsMember";
import { PostPurchaseUpsell } from "@/components/PostPurchaseUpsell";
import { recordExperimentRevenueForVisitor } from "@/lib/experimentRevenue";
import { trackPurchase } from "@/lib/metaPixel";

export default function ThankYouPage() {
  const [params] = useSearchParams();
  const orderId = params.get("order") || params.get("vs_order") || "";
  const total = params.get("total");
  const bottles = Number(params.get("bottles") || 0);
  const { isMember } = useIsMember();
  const lastStore = (typeof window !== "undefined" && sessionStorage.getItem("lastStorePath")) || "/wines";

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

  return (
    <div className="min-h-screen flex flex-col">
      <Seo title="Thank You" path="/thank-you" noindex description="Order confirmed — thanks for helping rescue dogs." />
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="font-display text-3xl md:text-4xl font-bold uppercase mb-2">Order Confirmed</h1>
          {orderId && <p className="text-muted-foreground mb-2">Order #{orderId}</p>}
          <p className="text-foreground leading-relaxed mb-8">
            Thanks for ordering — your bottles are on the way. A confirmation email is being sent to you now.
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

          {/* Pack savings retro-look — non-members only, wine orders */}
          {!isMember && bottles > 0 && total && Number(total) > 0 && (
            <aside className="border border-primary bg-primary/5 p-5 my-6 text-left">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="h-5 w-5 text-primary" />
                <p className="font-bold uppercase tracking-brand text-sm">Pack members would have saved</p>
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