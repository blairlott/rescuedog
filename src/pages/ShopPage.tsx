import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHero } from "@/components/PageHero";
import { AnimatedProductGrid } from "@/components/AnimatedProductGrid";
import { useProducts } from "@/hooks/useProducts";
import { Loader2 } from "lucide-react";
import { ShopifyProduct } from "@/lib/shopify";

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
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !products || products.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No products found.</p>
          ) : (
            <AnimatedProductGrid products={products} />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ShopPage;
