import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/ProductCard";
import { useProducts } from "@/hooks/useProducts";
import { ShopifyProduct } from "@/lib/shopify";

// Hand-picked legacy wine accessory handles in addition to the
// new `wine-bar` collection tag.
const LEGACY_HANDLES = new Set([
  "rdw-wine-glass-2pk",
  "rescue-dog-wines-stemless-wine-glass",
  "rdw-wine-tumbler",
  "rdw-corkscrew-waiter",
  "rdw-opener-mag",
  "rdw-wine-chiller",
  "rdw-coasters-4pk",
  "rdw-gift-wine",
]);

export function WineBarStrip() {
  const { data: products } = useProducts(200);

  const items = useMemo(() => {
    return (products || []).filter((p: ShopifyProduct) => {
      const tags = (p.node.tags || []).map((t) => t.toLowerCase());
      if (tags.includes("wine-bar")) return true;
      return LEGACY_HANDLES.has(p.node.handle);
    });
  }, [products]);

  if (!items.length) return null;

  return (
    <section className="py-12 border-t border-border bg-background">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-brand text-primary mb-2 font-bold flex items-center gap-2">
              <Wine className="h-4 w-4" /> The Wine Bar
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
              Glassware, openers &amp; gifts
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm">
              The everything-you-need set for opening, pouring, and serving the
              bottles you love — including ours.
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="uppercase tracking-brand text-xs font-bold border-foreground"
          >
            <Link to="/wines">
              Shop the Wines <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {items.slice(0, 8).map((product) => (
            <ProductCard key={product.node.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}