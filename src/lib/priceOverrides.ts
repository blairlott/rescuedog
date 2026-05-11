import type { ShopifyProduct } from "@/lib/shopify";

/**
 * Local price overrides for products whose pricing is set outside Shopify
 * (e.g. promotional bundles, Vinoshipper-managed wines).
 *
 * TODO: Replace this map with a live pull from the Vinoshipper API once the
 * VS account/credentials are connected. Until then this keeps storefront
 * pricing accurate for hand-curated bundles like the 6-Bottle Sampler.
 */
export const PRICE_OVERRIDES_BY_HANDLE: Record<string, number> = {
  "6bottle-sampler": 164.95,
};

function overridePriceOnNode(node: any, amount: number) {
  const amt = amount.toFixed(2);
  if (node?.priceRange?.minVariantPrice) {
    node.priceRange.minVariantPrice = {
      ...node.priceRange.minVariantPrice,
      amount: amt,
    };
  }
  const variantEdges = node?.variants?.edges;
  if (Array.isArray(variantEdges)) {
    variantEdges.forEach((v: any) => {
      if (v?.node?.price) {
        v.node.price = { ...v.node.price, amount: amt };
      }
    });
  }
  return node;
}

export function applyPriceOverrideToNode<T extends { handle?: string }>(node: T): T {
  if (!node?.handle) return node;
  const override = PRICE_OVERRIDES_BY_HANDLE[node.handle];
  if (override == null) return node;
  return overridePriceOnNode(node, override);
}

export function applyPriceOverrides(edges: ShopifyProduct[]): ShopifyProduct[] {
  return edges.map((edge) => {
    if (!edge?.node) return edge;
    applyPriceOverrideToNode(edge.node);
    return edge;
  });
}