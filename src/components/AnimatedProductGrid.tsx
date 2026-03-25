import { ShopifyProduct } from "@/lib/shopify";
import { ProductCard } from "./ProductCard";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface AnimatedProductGridProps {
  products: ShopifyProduct[];
  columns?: string;
}

function AnimatedCard({ product, index }: { product: ShopifyProduct; index: number }) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>(0.05);

  return (
    <div
      ref={ref}
      className="transition-all duration-700 ease-out"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(24px)",
        transitionDelay: `${(index % 5) * 80}ms`,
      }}
    >
      <ProductCard product={product} />
    </div>
  );
}

export function AnimatedProductGrid({
  products,
  columns = "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
}: AnimatedProductGridProps) {
  return (
    <div className={`grid ${columns} gap-x-5 gap-y-10`}>
      {products.map((product, i) => (
        <AnimatedCard key={product.node.id} product={product} index={i} />
      ))}
    </div>
  );
}
