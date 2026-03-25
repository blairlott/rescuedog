import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { useProducts } from "@/hooks/useProducts";
import { Loader2 } from "lucide-react";
import { ShopifyProduct } from "@/lib/shopify";
import { useState, useMemo } from "react";

// Desired display order matching rescuedogwines.com/shop-wine
const WINE_SORT_ORDER = [
  "6-bottle-sampler-shipping-included",
  "rescue-dog-wines-cabernet-sauvignon",
  "rescue-dog-wines-red-blend",
  "rescue-dog-wines-sauvignon-blanc",
  "rescue-dog-wines-chardonnay",
  "rescue-dog-wines-ros-of-pinot-noir",
  "rescue-dog-wines-rose-of-pinot-noir",
  "rescue-dog-wines-pinot-noir",
  "rescue-dog-wines-methode-champenoise-demi-sec",
  "rescue-dog-wines-methode-champenoise-sparkling-rose",
];

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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-foreground mb-2">Our Wines</h1>
          <p className="text-muted-foreground mb-8">Handcrafted wines that support rescue dogs.</p>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-4">
            {categories.map((cat, i) => (
              <button
                key={cat.label}
                onClick={() => setActiveCategory(i)}
                className={`px-4 py-2 text-sm font-bold tracking-brand uppercase transition-colors ${
                  activeCategory === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground hover:bg-muted"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : !products || products.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No wines found in this category.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {products.map((product: ShopifyProduct) => (
                <ProductCard key={product.node.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default WinesPage;
