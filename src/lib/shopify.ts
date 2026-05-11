/**
 * Shopify-shaped catalog adapter (Lovable-native).
 *
 * NOTE: Despite the file name, this module no longer talks to Shopify.
 * Wine catalog → public.wine_products (Vinoshipper is source of truth)
 * Merch catalog → public.merch_products (Lovable Cloud is source of truth)
 *
 * The legacy `ShopifyProduct` shape is preserved as the in-memory wire format
 * so existing components keep working without a sweeping rename.
 *
 * Cart is local-only. Wine checkout → Vinoshipper deep link (per item).
 * Merch checkout → placeholder (no payment provider wired yet).
 */
import { supabase } from "@/integrations/supabase/client";

export interface ShopifyProduct {
  node: {
    id: string;
    title: string;
    description: string;
    handle: string;
    tags: string[];
    priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
    images: { edges: Array<{ node: { url: string; altText: string | null } }> };
    variants: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          price: { amount: string; currencyCode: string };
          availableForSale: boolean;
          selectedOptions: Array<{ name: string; value: string }>;
        };
      }>;
    };
    options: Array<{ name: string; values: string[] }>;
    /** Lovable extension: Vinoshipper deep-link cart URL for wine items. */
    vinoshipperCartUrl?: string | null;
    /** Lovable extension: 'wine' | 'merch' classification. */
    productKind?: "wine" | "merch";
  };
}

export interface CartItem {
  lineId: string | null;
  product: ShopifyProduct;
  variantId: string;
  variantTitle: string;
  price: { amount: string; currencyCode: string };
  quantity: number;
  selectedOptions: Array<{ name: string; value: string }>;
}

const cents = (n: number | null | undefined) => ((n ?? 0) / 100).toFixed(2);

function wineRowToProduct(row: any): ShopifyProduct {
  const id = `wine:${row.handle}`;
  const variantId = `wine-variant:${row.handle}`;
  const price = { amount: cents(row.price_cents), currencyCode: "USD" };
  const images = (row.gallery_urls?.length ? row.gallery_urls : (row.image_url ? [row.image_url] : []))
    .map((url: string) => ({ node: { url, altText: row.title } }));
  return {
    node: {
      id,
      title: row.title,
      description: row.description ?? "",
      handle: row.handle,
      tags: row.tags ?? [],
      priceRange: { minVariantPrice: price },
      images: { edges: images },
      variants: {
        edges: [{
          node: {
            id: variantId,
            title: "Default",
            price,
            availableForSale: !!row.in_stock,
            selectedOptions: [],
          },
        }],
      },
      options: [],
      vinoshipperCartUrl: row.vinoshipper_cart_url ?? null,
      productKind: "wine",
    },
  };
}

function merchRowToProduct(row: any): ShopifyProduct {
  const id = `merch:${row.handle}`;
  const dbVariants: any[] = Array.isArray(row.variants) && row.variants.length ? row.variants : [{
    sku: row.handle, title: "Default", price_cents: row.price_cents, available: true, options: [],
  }];
  const variants = dbVariants.map((v, idx) => ({
    node: {
      id: `merch-variant:${row.handle}:${v.sku || idx}`,
      title: v.title || "Default",
      price: { amount: cents(v.price_cents ?? row.price_cents), currencyCode: "USD" },
      availableForSale: v.available !== false,
      selectedOptions: v.options ?? [],
    },
  }));
  const images = (row.gallery_urls?.length ? row.gallery_urls : (row.image_url ? [row.image_url] : []))
    .map((url: string) => ({ node: { url, altText: row.title } }));
  return {
    node: {
      id,
      title: row.title,
      description: row.description ?? "",
      handle: row.handle,
      tags: row.tags ?? [],
      priceRange: { minVariantPrice: { amount: cents(row.price_cents), currencyCode: "USD" } },
      images: { edges: images },
      variants: { edges: variants },
      options: row.options ?? [],
      productKind: "merch",
    },
  };
}

export async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const [{ data: wines }, { data: merch }] = await Promise.all([
    supabase.from("wine_products").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("merch_products").select("*").eq("is_active", true).order("sort_order"),
  ]);
  return [
    ...(wines ?? []).map(wineRowToProduct),
    ...(merch ?? []).map(merchRowToProduct),
  ];
}

export async function fetchWineProducts(): Promise<ShopifyProduct[]> {
  const { data } = await supabase.from("wine_products").select("*").eq("is_active", true).order("sort_order");
  return (data ?? []).map(wineRowToProduct);
}

export async function fetchMerchProducts(): Promise<ShopifyProduct[]> {
  const { data } = await supabase.from("merch_products").select("*").eq("is_active", true).order("sort_order");
  return (data ?? []).map(merchRowToProduct);
}

export async function fetchProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const { data: wine } = await supabase.from("wine_products").select("*").eq("handle", handle).maybeSingle();
  if (wine) return wineRowToProduct(wine);
  const { data: merch } = await supabase.from("merch_products").select("*").eq("handle", handle).maybeSingle();
  if (merch) return merchRowToProduct(merch);
  return null;
}

/* ---------------------------------------------------------------------- */
/* Local cart helpers — no remote calls. Kept under the same export names */
/* the rest of the codebase used to consume from Shopify.                 */
/* ---------------------------------------------------------------------- */

export async function createShopifyCart(_item: CartItem) {
  return { cartId: `local:${crypto.randomUUID()}`, checkoutUrl: "", lineId: _item.variantId };
}
export async function addLineToShopifyCart(_cartId: string, item: CartItem) {
  return { success: true, lineId: item.variantId };
}
export async function updateShopifyCartLine(_cartId: string, _lineId: string, _quantity: number) {
  return { success: true };
}
export async function removeLineFromShopifyCart(_cartId: string, _lineId: string) {
  return { success: true };
}
export async function storefrontApiRequest(_q: string, _v: Record<string, unknown> = {}) {
  return { data: null };
}
export const STOREFRONT_PRODUCTS_QUERY = "";
export const STOREFRONT_PRODUCT_BY_HANDLE_QUERY = "";
export const CART_QUERY = "";

/**
 * Build a single Vinoshipper cart deep link from wine items in the cart.
 * Falls back to the producer storefront if no per-item URL is available.
 */
export function buildVinoshipperCheckoutUrl(items: CartItem[]): string | null {
  const wineItems = items.filter(i => i.product.node.productKind === "wine");
  if (wineItems.length === 0) return null;
  const first = wineItems[0].product.node.vinoshipperCartUrl;
  if (first) return first;
  return "https://vinoshipper.com/shop/rescue_dog_wines";
}
