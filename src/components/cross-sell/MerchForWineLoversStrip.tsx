import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/ProductCard";
import { useProducts } from "@/hooks/useProducts";
import { isWineProduct } from "@/lib/productUtils";

/**
 * Cross-sell strip shown on /wines — surfaces merch (apparel, drinkware,
 * gifts) so wine shoppers see we have more than bottles.
 */
export function MerchForWineLoversStrip() {
  const { data: products } = useProducts(200);

  const items = useMemo(() => {
    return (products || []).filter((p) => !isWineProduct(p)).slice(0, 4);
  }, [products]);

  if (!items.length) return null;

  return (
    <section className="py-12 border-t border-border bg-secondary/20 mt-12">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-brand text-primary mb-2 font-bold flex items-center gap-2">
              <Shirt className="h-4 w-4" /> Wear the Mission
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
              Merch &amp; gifts for wine lovers
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm">
              Tees, glassware, and gifts that pair perfectly with the bottles —
              every purchase supports rescue.
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="uppercase tracking-brand text-xs font-bold border-foreground"
          >
            <Link to="/merch">
              Shop Merch <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map((product) => (
            <ProductCard key={product.node.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}