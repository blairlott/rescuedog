import { useQuery } from '@tanstack/react-query';
import { storefrontApiRequest, STOREFRONT_PRODUCTS_QUERY, STOREFRONT_PRODUCT_BY_HANDLE_QUERY, ShopifyProduct } from '@/lib/shopify';
import { applyPriceOverrides, applyPriceOverrideToNode } from '@/lib/priceOverrides';

export function useProducts(first = 50, queryFilter?: string) {
  return useQuery({
    queryKey: ['shopify-products', first, queryFilter],
    queryFn: async () => {
      const data = await storefrontApiRequest(STOREFRONT_PRODUCTS_QUERY, { first, query: queryFilter });
      const edges = (data?.data?.products?.edges || []) as ShopifyProduct[];
      return applyPriceOverrides(edges);
    },
  });
}

export function useProductByHandle(handle: string) {
  return useQuery({
    queryKey: ['shopify-product', handle],
    queryFn: async () => {
      const data = await storefrontApiRequest(STOREFRONT_PRODUCT_BY_HANDLE_QUERY, { handle });
      const node = data?.data?.productByHandle || null;
      return node ? applyPriceOverrideToNode(node) : null;
    },
    enabled: !!handle,
  });
}
