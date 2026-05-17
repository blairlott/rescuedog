import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHero } from "@/components/PageHero";
import { AnimatedProductGrid } from "@/components/AnimatedProductGrid";
import { ShippingIncludedBanner } from "@/components/ShippingIncludedBanner";
import { useProducts } from "@/hooks/useProducts";
import { Loader2 } from "lucide-react";
import { ShopifyProduct } from "@/lib/shopify";
import { RescueSpotlightCard } from "@/components/rescue/RescueSpotlightCard";

const ShopPage = () => {
  const { data: products, isLoading } = useProducts(50);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <PageHero
        title="Shop All"
        subtitle="Wines, merch, and accessories — all supporting dog rescue."
        compact
      />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <p className="max-w-3xl mx-auto text-center text-sm md:text-base text-muted-foreground mb-8 leading-relaxed">
            Winemaker-driven by <span className="font-bold text-foreground">Susana Rodriguez Vasquez</span> — varietally correct and intentionally made from vine to glass.
          </p>
          <ShippingIncludedBanner />
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !products || products.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No products found.</p>
          ) : (
            (() => {
              // Drop a rescue spotlight after the first ~2 rows (10 cards on
              // desktop xl, fewer on smaller breakpoints). Falls back to the
              // end of the grid if there aren't enough products.
              const breakAt = Math.min(10, products.length);
              const head = products.slice(0, breakAt);
              const tail = products.slice(breakAt);
              return (
                <>
                  <AnimatedProductGrid products={head} />
                  <div className="my-12">
                    <RescueSpotlightCard variant="inline" seed="shop" />
                  </div>
                  {tail.length > 0 && <AnimatedProductGrid products={tail} />}
                </>
              );
            })()
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ShopPage;
