import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProducts } from "@/hooks/useProducts";
import { useBanditCandidate } from "@/hooks/useBanditCandidate";

const WINDOW_MIN = 15;
const DEFAULT_HANDLE = "6bottle-sampler";
const UPSELL_REGEX = /sampler|case|6-?pack|12-?pack|bundle|gift/i;

/**
 * One-click post-purchase upsell. Shows a 15-minute countdown nudging
 * the customer to add a multi-pack/bundle. The specific SKU is chosen
 * by the candidate-pool bandit (`post_purchase_upsell_sku`) — pool is
 * any product whose handle/title matches a multipack/bundle pattern.
 * Real "add to existing order" (no new shipping) requires a Stripe
 * customer + Vinoshipper order-edit hook; for now this routes them back
 * into a new order with an upsell promo code pre-applied.
 */
export function PostPurchaseUpsell({ orderId }: { orderId: string }) {
  const [secondsLeft, setSecondsLeft] = useState(WINDOW_MIN * 60);
  const { data: products } = useProducts(200);

  const pool = useMemo(() => {
    if (!products) return [];
    return products
      .filter((p) => {
        const v = p.node.variants.edges[0]?.node;
        if (!v?.availableForSale) return false;
        const handle = p.node.handle;
        const title = p.node.title ?? "";
        return UPSELL_REGEX.test(handle) || UPSELL_REGEX.test(title);
      })
      .sort((a, b) => a.node.handle.localeCompare(b.node.handle))
      .slice(0, 10);
  }, [products]);

  const candidates = useMemo(
    () => pool.map((p) => ({ ref: p.node.handle, type: "wine" })),
    [pool],
  );

  const pick = useBanditCandidate(
    "post_purchase_upsell_sku",
    candidates,
    pool[0]?.node.handle ?? DEFAULT_HANDLE,
    { name: "Post-purchase upsell SKU", primaryMetric: "revenue_per_visitor", explorationFloor: 80 },
  );

  const handle = pick.candidateRef ?? pool[0]?.node.handle ?? DEFAULT_HANDLE;
  const matched = pool.find((p) => p.node.handle === handle);
  const label = matched?.node.title ?? "6-Bottle Sampler";

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
        Add a <strong>{label}</strong> in the next {WINDOW_MIN} minutes —
        we'll combine it with order <span className="font-mono">#{orderId}</span> so you only pay shipping once.
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Use code <span className="font-mono font-bold text-primary">ADDON15</span> at checkout.
      </p>
      <Button asChild className="mt-4 uppercase tracking-brand text-xs font-bold">
        <Link
          to={`/product/${handle}`}
          onClick={() => pick.recordClick({ handle })}
        >
          Add it — save shipping
        </Link>
      </Button>
    </aside>
  );
}