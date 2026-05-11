import type { ShopifyProduct } from "@/lib/shopify";

/**
 * Legacy no-op shim. Pricing now lives in Supabase (wine_products /
 * merch_products) — overrides have been migrated into the source rows.
 */
export function applyPriceOverrideToNode<T>(node: T): T { return node; }
export function applyPriceOverrides(edges: ShopifyProduct[]): ShopifyProduct[] { return edges; }
export const PRICE_OVERRIDES_BY_HANDLE: Record<string, number> = {};
