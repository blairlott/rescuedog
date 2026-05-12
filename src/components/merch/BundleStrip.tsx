import { useMemo } from "react";
import { Loader2, Package, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMerchBundles, MerchBundle } from "@/hooks/useMerchBundles";
import { useProducts } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { ShopifyProduct } from "@/lib/shopify";
import { toast } from "sonner";

function findProduct(handle: string, products: ShopifyProduct[]) {
  return products.find((p) => p.node.handle === handle);
}

export function BundleStrip() {
  const { data: bundles, isLoading } = useMerchBundles();
  const { data: products } = useProducts(200);
  const addItem = useCartStore((s) => s.addItem);

  const ready = useMemo(
    () => (bundles ?? []).filter((b) => b.sku_handles.every((h) => findProduct(h, products ?? []))),
    [bundles, products],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!ready.length) return null;

  const handleAddBundle = async (b: MerchBundle) => {
    if (!products) return;
    // Distribute the bundle price proportionally across SKUs so the cart
    // total honors the bundle discount even with our local-cart model.
    const items = b.sku_handles.map((h) => findProduct(h, products)!);
    const fullSubtotal = items.reduce(
      (sum, p) => sum + parseFloat(p.node.priceRange.minVariantPrice.amount),
      0,
    );
    const ratio = b.bundle_price_cents / 100 / fullSubtotal;

    for (const p of items) {
      const variant = p.node.variants.edges[0]?.node;
      if (!variant) continue;
      const adjusted = parseFloat(variant.price.amount) * ratio;
      await addItem({
        product: p,
        variantId: `${variant.id}::bundle:${b.handle}`,
        variantTitle: `${variant.title} · ${b.title}`,
        price: { amount: adjusted.toFixed(2), currencyCode: variant.price.currencyCode },
        quantity: 1,
        selectedOptions: variant.selectedOptions ?? [],
        bundleId: b.handle,
      });
    }
    toast.success(`${b.title} added — saved $${((b.compare_at_cents ?? 0) - b.bundle_price_cents) / 100}`, {
      position: "top-center",
    });
  };

  return (
    <section className="container mx-auto px-4 mb-16">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-brand text-muted-foreground mb-1">Curated Bundles</p>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">The Packs</h2>
        </div>
        <span className="hidden md:inline-flex items-center text-xs uppercase tracking-brand text-muted-foreground">
          One click. Bundle savings included <ArrowRight className="ml-1 h-3 w-3" />
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {ready.map((b) => (
          <article key={b.id} className="group relative bg-background border border-border overflow-hidden flex flex-col">
            <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
              {b.hero_image_url ? (
                <img
                  src={b.hero_image_url}
                  alt={b.title}
                  className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
              {b.badge_label && (
                <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-brand px-2.5 py-1">
                  {b.badge_label}
                </span>
              )}
            </div>
            <div className="p-5 flex-1 flex flex-col">
              <p className="text-[10px] uppercase tracking-brand text-muted-foreground mb-1">
                {b.subtitle}
              </p>
              <h3 className="text-lg font-bold text-foreground mb-2">{b.title}</h3>
              <p className="text-sm text-muted-foreground mb-4 flex-1 leading-relaxed">{b.description}</p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-xl font-bold text-foreground">
                  ${(b.bundle_price_cents / 100).toFixed(2)}
                </span>
                {b.compare_at_cents && b.compare_at_cents > b.bundle_price_cents && (
                  <span className="text-sm text-muted-foreground line-through">
                    ${(b.compare_at_cents / 100).toFixed(2)}
                  </span>
                )}
                <span className="ml-auto text-[10px] uppercase tracking-brand text-muted-foreground">
                  {b.sku_handles.length} pieces
                </span>
              </div>
              <Button
                onClick={() => handleAddBundle(b)}
                className="w-full bg-foreground text-background hover:bg-foreground/90 uppercase tracking-brand text-xs font-bold h-10"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add the Edit
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
