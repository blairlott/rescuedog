import { useQuery } from "@tanstack/react-query";
import { fetchAllProducts, fetchProductByHandle, fetchWineProducts, fetchMerchProducts, ShopifyProduct } from "@/lib/shopify";

/**
 * Lovable-native catalog hook (formerly backed by Shopify).
 * `queryFilter` supports two values for backward compat:
 *   - "tag:wine" / undefined → all products (or wines only when caller filters)
 *   - any other → ignored (catalog is small enough to filter client-side)
 */
export function useProducts(_first = 50, queryFilter?: string) {
  return useQuery({
    queryKey: ["catalog-products", queryFilter],
    queryFn: async () => {
      if (queryFilter?.toLowerCase().includes("wine")) return fetchWineProducts();
      if (queryFilter?.toLowerCase().includes("merch")) return fetchMerchProducts();
      return fetchAllProducts();
    },
  });
}

export function useProductByHandle(handle: string) {
  return useQuery<ShopifyProduct["node"] | null>({
    queryKey: ["catalog-product", handle],
    queryFn: () => fetchProductByHandle(handle),
    enabled: !!handle,
  });
}
