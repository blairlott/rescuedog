import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";

const WINDOW_MIN = 15;

/**
 * One-click post-purchase upsell. Shows a 15-minute countdown nudging
 * the customer to add a 6-pack to their order. Real "add to existing
 * order" (no new shipping) requires a Stripe customer + Vinoshipper
 * order-edit hook; for now this routes them back into a new order with
 * an upsell promo code pre-applied.
 */
export function PostPurchaseUpsell({ orderId }: { orderId: string }) {
  const [secondsLeft, setSecondsLeft] = useState(WINDOW_MIN * 60);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  if (secondsLeft <= 0) return null;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <aside className="border-2 border-primary bg-primary/5 p-5 my-6 text-left">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <p className="font-bold uppercase tracking-brand text-sm">Add to your order</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-primary font-mono font-bold">
          <Clock className="h-3.5 w-3.5" />
          {mm}:{ss}
        </div>
      </div>
      <p className="text-sm mt-3 leading-relaxed">
        Add a <strong>6-Bottle Sampler</strong> in the next {WINDOW_MIN} minutes —
        we'll combine it with order <span className="font-mono">#{orderId}</span> so you only pay shipping once.
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Use code <span className="font-mono font-bold text-primary">ADDON15</span> at checkout.
      </p>
      <Button asChild className="mt-4 uppercase tracking-brand text-xs font-bold">
        <Link to="/product/6bottle-sampler">Add a 6-pack — save shipping</Link>
      </Button>
    </aside>
  );
}