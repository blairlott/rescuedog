import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHero } from "@/components/PageHero";
import { Seo } from "@/components/Seo";
import { useProducts } from "@/hooks/useProducts";
import { isWineProduct } from "@/lib/productUtils";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Loader2, Minus, Plus, Wine } from "lucide-react";
import { toast } from "sonner";

const TIERS = [
  { qty: 6, off: 5, label: "6-pack — 5% off" },
  { qty: 12, off: 10, label: "Case — 10% off" },
  { qty: 24, off: 15, label: "2 Cases — 15% off" },
];

export default function MixSixPage() {
  const { data: products, isLoading } = useProducts(50);
  const addItem = useCartStore((s) => s.addItem);
  const cartLoading = useCartStore((s) => s.isLoading);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const wines = useMemo(
    () => (products || []).filter(isWineProduct),
    [products],
  );

  const totalBottles = Object.values(counts).reduce((s, n) => s + n, 0);
  const subtotal = wines.reduce((s, w) => {
    const n = counts[w.node.handle] || 0;
    return s + n * parseFloat(w.node.priceRange.minVariantPrice.amount);
  }, 0);

  const tier = [...TIERS].reverse().find((t) => totalBottles >= t.qty);
  const discountPct = tier?.off ?? 0;
  const discounted = subtotal * (1 - discountPct / 100);
  const nextTier = TIERS.find((t) => totalBottles < t.qty);

  const inc = (h: string) => setCounts({ ...counts, [h]: (counts[h] || 0) + 1 });
  const dec = (h: string) => setCounts({ ...counts, [h]: Math.max(0, (counts[h] || 0) - 1) });

  const addToCart = async () => {
    if (totalBottles < 6) {
      toast.error("Pick at least 6 bottles to unlock the mix discount");
      return;
    }
    for (const w of wines) {
      const n = counts[w.node.handle] || 0;
      if (n <= 0) continue;
      const v = w.node.variants.edges[0]?.node;
      if (!v) continue;
      await addItem({
        product: w,
        variantId: v.id,
        variantTitle: v.title,
        price: v.price,
        quantity: n,
        selectedOptions: v.selectedOptions || [],
      });
    }
    toast.success(`${totalBottles} bottles added — ${discountPct}% mix discount applied at checkout`);
    setCounts({});
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Seo
        title="Build a Mix Six"
        description="Mix and match any 6, 12, or 24 bottles — unlock 5–15% off plus shipping included."
        path="/wines/mix-six"
      />
      <Header />
      <PageHero
        title="Build Your Mix"
        subtitle="Pick any 6+ bottles. Unlock up to 15% off, shipping included on 6+."
        compact
      />
      <main className="flex-1 py-10">
        <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          <section>
            {isLoading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {wines.map((w) => {
                  const n = counts[w.node.handle] || 0;
                  const img = w.node.images.edges[0]?.node;
                  const price = parseFloat(w.node.priceRange.minVariantPrice.amount);
                  return (
                    <li key={w.node.id} className="border border-border p-3 flex gap-3 bg-card">
                      <div className="w-16 h-20 bg-muted flex items-center justify-center flex-shrink-0">
                        {img ? (
                          <img src={img.url} alt={w.node.title} className="max-h-full object-contain" loading="lazy" />
                        ) : (
                          <Wine className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <p className="text-sm font-semibold leading-tight">{w.node.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">${price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dec(w.node.handle)} disabled={n === 0}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm font-bold">{n}</span>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => inc(w.node.handle)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside className="lg:sticky lg:top-8 lg:self-start border border-border bg-card p-5 space-y-4">
            <h2 className="font-display font-bold text-lg uppercase tracking-brand">Your Mix</h2>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Bottles</span>
                <span className="font-mono font-bold">{totalBottles}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span className="font-mono">${subtotal.toFixed(2)}</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between text-sm text-primary font-bold">
                  <span>Mix discount ({discountPct}%)</span>
                  <span className="font-mono">-${(subtotal - discounted).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-border mt-2">
                <span>Total</span>
                <span className="font-mono">${discounted.toFixed(2)}</span>
              </div>
            </div>
            {nextTier && (
              <p className="text-xs text-muted-foreground">
                Add {nextTier.qty - totalBottles} more for {nextTier.off}% off.
              </p>
            )}
            <Button
              onClick={addToCart}
              disabled={cartLoading || totalBottles < 6}
              size="lg"
              className="w-full uppercase tracking-brand text-xs font-bold"
            >
              {cartLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add mix to cart`}
            </Button>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Shipping included on 6+ bottles. Mix discount applied automatically at checkout.
            </p>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}