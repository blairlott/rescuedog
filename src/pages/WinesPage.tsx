import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHero } from "@/components/PageHero";
import { FeaturedProduct } from "@/components/FeaturedProduct";
import { AnimatedProductGrid } from "@/components/AnimatedProductGrid";
import { ShippingIncludedBanner } from "@/components/ShippingIncludedBanner";
import { MerchForWineLoversStrip } from "@/components/cross-sell/MerchForWineLoversStrip";
import { useProducts } from "@/hooks/useProducts";
import { Loader2 } from "lucide-react";
import { ShopifyProduct } from "@/lib/shopify";
import { useState, useMemo } from "react";
import { Seo } from "@/components/Seo";
import vineyardHero from "@/assets/migrated/vineyard-grapes.jpg";

const WINE_SORT_ORDER = [
  "mothers-day-6-pack",
  "cabernet-sauvignon",
  "red-wine-blend",
  "rescue-dog-wines-sauvignon-blanc",
  "chardonnay",
  "rescue-dog-wines-ros-of-pinot-noir",
  "2023-rose-estate-grown-grenache",
  "central-coast-pinot-noir",
  "demisec-mthode-champenoise-sparkling-wine",
  "mthode-champenoise-sparkling-ros",
];

const FEATURED_HANDLE = "mothers-day-6-pack";

const categories = [
  { label: "All", tag: null as string | null },
  { label: "Red", tag: "red" },
  { label: "White", tag: "white" },
  { label: "Sparkling", tag: "sparkling" },
  { label: "Rosé", tag: "rose" },
  { label: "Bundles", tag: "bundle" },
];

const WinesPage = () => {
  const [activeCategory, setActiveCategory] = useState(0);
  const { data: products, isLoading } = useProducts(50, "product_type:Wine");

  const { featured, sortedProducts } = useMemo(() => {
    if (!products) return { featured: null, sortedProducts: [] };
    const activeTag = categories[activeCategory].tag;
    const filtered = activeTag
      ? products.filter((p) =>
          (p.node.tags || []).some((t) => t.toLowerCase() === activeTag),
        )
      : products;
    const feat = activeCategory === 0
      ? filtered.find((p) => p.node.handle === FEATURED_HANDLE) || null
      : null;
    const rest = feat
      ? filtered.filter((p) => p.node.handle !== FEATURED_HANDLE)
      : [...filtered];
    rest.sort((a, b) => {
      const idxA = WINE_SORT_ORDER.indexOf(a.node.handle);
      const idxB = WINE_SORT_ORDER.indexOf(b.node.handle);
      const posA = idxA === -1 ? WINE_SORT_ORDER.length : idxA;
      const posB = idxB === -1 ? WINE_SORT_ORDER.length : idxB;
      return posA - posB;
    });
    return { featured: feat, sortedProducts: rest };
  }, [products, activeCategory]);

  return (
    <div className="min-h-screen flex flex-col">
      <Seo
        title="Shop Wines"
        description="Award-winning Lodi wines — Cabernet, Red Blend, Sauvignon Blanc, Chardonnay, Rosé and Sparkling. Flat $9.99 shipping on 6+ bottles, included on 12+."
        path="/wines"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Wines", path: "/wines" },
        ]}
      />
      <Header />

      <PageHero
        title="Our Wines"
        subtitle="Award-winning, sustainably crafted wines — every bottle supports dog rescue."
        backgroundImage={vineyardHero}
      />

      {/* Featured product spotlight */}
      {featured && <FeaturedProduct product={featured} label="Best Seller" />}

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 mb-10 border-b border-border pb-4">
            {categories.map((cat, i) => (
              <button
                key={cat.label}
                onClick={() => setActiveCategory(i)}
                className={`px-5 py-2.5 text-xs font-bold tracking-brand uppercase transition-colors ${
                  activeCategory === i
                    ? "bg-foreground text-background"
                    : "bg-transparent text-foreground border border-border hover:bg-muted"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <ShippingIncludedBanner />
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sortedProducts.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No wines found in this category.</p>
          ) : (
            <AnimatedProductGrid products={sortedProducts} />
          )}
        </div>
      </main>

      <MerchForWineLoversStrip />

      <Footer />
    </div>
  );
};

export default WinesPage;
