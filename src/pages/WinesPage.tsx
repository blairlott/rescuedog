import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHero } from "@/components/PageHero";
import { FeaturedProduct } from "@/components/FeaturedProduct";
import { AnimatedProductGrid } from "@/components/AnimatedProductGrid";
import { ShippingIncludedBanner } from "@/components/ShippingIncludedBanner";
import { useProducts } from "@/hooks/useProducts";
import { Loader2 } from "lucide-react";
import { ShopifyProduct } from "@/lib/shopify";
import { useState, useMemo } from "react";

const WINE_SORT_ORDER = [
  "6bottle-sampler",
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

const FEATURED_HANDLE = "6bottle-sampler";

const categories = [
  { label: "All", filter: "product_type:Wine" },
  { label: "Red", filter: "product_type:Wine tag:Red" },
  { label: "White", filter: "product_type:Wine tag:White" },
  { label: "Sparkling", filter: "product_type:Wine tag:Sparkling" },
  { label: "Rosé", filter: "product_type:Wine tag:Rose" },
  { label: "Bundles", filter: "product_type:Wine tag:Bundle" },
];

const WinesPage = () => {
  const [activeCategory, setActiveCategory] = useState(0);
  const { data: products, isLoading } = useProducts(50, categories[activeCategory].filter);

  const { featured, sortedProducts } = useMemo(() => {
    if (!products) return { featured: null, sortedProducts: [] };
    const feat = activeCategory === 0
      ? products.find((p) => p.node.handle === FEATURED_HANDLE) || null
      : null;
    const rest = feat
      ? products.filter((p) => p.node.handle !== FEATURED_HANDLE)
      : [...products];
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
      <Header />

      <PageHero
        title="Our Wines"
        subtitle="Award-winning, sustainably crafted wines — every bottle supports dog rescue."
        backgroundImage="https://rescuedogwines.com/wp-content/uploads/2025/03/rdw-estate-vineyard-3.webp"
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

      <Footer />
    </div>
  );
};

export default WinesPage;
