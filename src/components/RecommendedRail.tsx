import { useMemo } from "react";
import { ShopifyProduct } from "@/lib/shopify";
import { ProductCard } from "./ProductCard";
import { useBanditCandidate, CandidateInput } from "@/hooks/useBanditCandidate";
import { Sparkles } from "lucide-react";

interface Props {
  /** Stable slot prefix — e.g. "rail_wines", "rail_shop", "rail_merch". */
  slotPrefix: string;
  /** Heading copy. */
  title?: string;
  /** Subhead copy. */
  subtitle?: string;
  /** Pool of products to choose from (10–30 SKUs works well). */
  pool: ShopifyProduct[];
  /** Number of tiles to render (defaults to 4). */
  count?: number;
}

/**
 * "Recommended for you" rail. Bandit picks N tiles per visitor segment from a
 * candidate pool. Sits ABOVE curated grids so it never disturbs hand-sorted
 * order. Each tile is its own bandit slot (A/B/C/D) so the system learns the
 * best SKU per position independently. Renders nothing while the pool is
 * empty or all picks collide.
 */
export function RecommendedRail({
  slotPrefix,
  title = "Recommended for you",
  subtitle = "Picked by what's working right now.",
  pool,
  count = 4,
}: Props) {
  const candidates: CandidateInput[] = useMemo(
    () =>
      pool.map((p) => ({
        ref: p.node.handle,
        type: "product",
        metadata: { title: p.node.title },
      })),
    [pool],
  );

  const slots = ["a", "b", "c", "d", "e", "f"].slice(0, count);
  // One bandit pick per slot. Defaults stagger across the pool so a cold-start
  // visitor still sees variety rather than 4 copies of the same SKU.
  const picks = slots.map((s, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useBanditCandidate(
      `${slotPrefix}_${s}`,
      candidates,
      pool[i % Math.max(1, pool.length)]?.node.handle ?? null,
      { name: `Recommended Rail ${slotPrefix} ${s.toUpperCase()}`, explorationFloor: 80 },
    ),
  );

  const seen = new Set<string>();
  const resolved: { product: ShopifyProduct; pick: (typeof picks)[number] }[] = [];
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    let handle = pick.candidateRef;
    let product = pool.find((p) => p.node.handle === handle);
    if (!product || seen.has(handle!)) {
      product = pool.find((p) => !seen.has(p.node.handle));
      handle = product?.node.handle ?? null;
    }
    if (!product || !handle) continue;
    seen.add(handle);
    resolved.push({ product, pick });
  }

  if (resolved.length === 0) return null;

  return (
    <section className="border-t border-b border-border bg-secondary/40 py-10 mb-10">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-brand font-bold text-primary mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Smart picks</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-8">
          {resolved.map(({ product, pick }) => (
            <div
              key={product.node.id}
              onClickCapture={() => pick.recordClick({ handle: product.node.handle })}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}