/**
 * Catalog + cart adapter.
 *
 * Wine catalog → public.wine_products (Vinoshipper is source of truth)
 * Merch catalog → Shopify Storefront API (rescuedoggear / gear.rescuedog.com)
 *
 * Cart is local-only for wine items (Vinoshipper deep-link at checkout).
 * For merch items, the local cart mirrors a real Shopify cart created via the
 * Storefront API so checkout can hand off to Shopify's hosted checkout.
 */
import { supabase } from "@/integrations/supabase/client";

/* -------------------------------------------------------------------------- */
/* Shopify Storefront API constants                                           */
/* -------------------------------------------------------------------------- */

const SHOPIFY_API_VERSION = "2025-07";
const SHOPIFY_STORE_PERMANENT_DOMAIN = "home-45-new-fashion.myshopify.com";
const SHOPIFY_STOREFRONT_URL = `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
// Publishable Storefront API access token — safe to ship in client bundles.
const SHOPIFY_STOREFRONT_TOKEN = "a039bebde9c0f1527abdb6545d369618";

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
    /** Lovable extension: numeric Vinoshipper product ID for Injector add-to-cart. */
    vinoshipperProductId?: string | null;
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
  bundleId?: string | null;
  giftMeta?: {
    wrap?: boolean;
    message?: string;
    recipientEmail?: string;
  } | null;
}

const cents = (n: number | null | undefined) => ((n ?? 0) / 100).toFixed(2);

/* -------------------------------------------------------------------------- */
/* Wine adapter (Supabase / Vinoshipper)                                      */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Shopify Storefront API client                                              */
/* -------------------------------------------------------------------------- */

async function storefrontApiRequest<T = any>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data: T } | null> {
  try {
    const response = await fetch(SHOPIFY_STOREFRONT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 402) {
      console.error("[Shopify] 402 — store needs a paid plan to use Storefront API");
      return null;
    }

    if (!response.ok) {
      console.error(`[Shopify] HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.errors) {
      console.error("[Shopify] GraphQL errors:", data.errors);
      return null;
    }

    return data as { data: T };
  } catch (err) {
    console.error("[Shopify] request failed:", err);
    return null;
  }
}

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          description
          handle
          tags
          productType
          vendor
          priceRange { minVariantPrice { amount currencyCode } }
          images(first: 8) { edges { node { url altText } } }
          variants(first: 50) {
            edges {
              node {
                id title availableForSale
                price { amount currencyCode }
                selectedOptions { name value }
              }
            }
          }
          options { name values }
        }
      }
    }
  }
`;

const PRODUCT_BY_HANDLE_QUERY = `
  query GetProductByHandle($handle: String!) {
    product(handle: $handle) {
      id title description handle tags productType vendor
      priceRange { minVariantPrice { amount currencyCode } }
      images(first: 8) { edges { node { url altText } } }
      variants(first: 50) {
        edges {
          node {
            id title availableForSale
            price { amount currencyCode }
            selectedOptions { name value }
          }
        }
      }
      options { name values }
    }
  }
`;

/**
 * Map a Shopify product type / vendor to a merch category tag the
 * MerchHomePage filter chips understand.
 */
function categoryTagsForShopifyProduct(p: any): string[] {
  const tags: string[] = Array.isArray(p.tags) ? [...p.tags] : [];
  const type = (p.productType || "").toLowerCase();
  const title = (p.title || "").toLowerCase();
  const has = (s: string) => tags.some(t => t.toLowerCase() === s);

  const ensure = (t: string) => { if (!has(t)) tags.push(t); };

  if (type.includes("t-shirt") || type.includes("shirt") || type.includes("knitwear") || type.includes("sweater") || type.includes("hoodie") || type.includes("hat") || title.includes("cap") || title.includes("visor") || title.includes("pullover")) {
    ensure("apparel");
  }
  if (type.includes("drinkware") || title.includes("mug") || title.includes("tumbler") || title.includes("glass")) {
    ensure("drinkware");
  }
  if (type.includes("pet") || title.includes("bandana") || title.includes("collar") || title.includes("bowl")) {
    ensure("pet");
  }
  if (type.includes("decor") || title.includes("ornament") || title.includes("sticker")) {
    ensure("home");
  }
  return tags;
}

function shopifyProductToAdapter(p: any): ShopifyProduct {
  return {
    node: {
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      handle: p.handle,
      tags: categoryTagsForShopifyProduct(p),
      priceRange: p.priceRange,
      images: p.images,
      variants: p.variants,
      options: p.options ?? [],
      productKind: "merch",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Public catalog API                                                         */
/* -------------------------------------------------------------------------- */

export async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const [wines, merch] = await Promise.all([fetchWineProducts(), fetchMerchProducts()]);
  return [...wines, ...merch];
}

export async function fetchWineProducts(): Promise<ShopifyProduct[]> {
  const { data } = await supabase
    .from("wine_products")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map(wineRowToProduct);
}

export async function fetchMerchProducts(): Promise<ShopifyProduct[]> {
  const result = await storefrontApiRequest<{
    products: { edges: Array<{ node: any }> };
  }>(PRODUCTS_QUERY, { first: 100 });
  if (!result) return [];
  return result.data.products.edges.map(e => shopifyProductToAdapter(e.node));
}

export async function fetchProductByHandle(handle: string): Promise<ShopifyProduct["node"] | null> {
  // Try wine first (matches existing behavior).
  const { data: wine } = await supabase
    .from("wine_products")
    .select("*")
    .eq("handle", handle)
    .maybeSingle();
  if (wine) return wineRowToProduct(wine).node;

  const result = await storefrontApiRequest<{ product: any | null }>(
    PRODUCT_BY_HANDLE_QUERY,
    { handle },
  );
  if (!result?.data?.product) return null;
  return shopifyProductToAdapter(result.data.product).node;
}

/* -------------------------------------------------------------------------- */
/* Shopify Cart API (merch only)                                              */
/* -------------------------------------------------------------------------- */

const CART_QUERY = `
  query cart($id: ID!) {
    cart(id: $id) { id totalQuantity checkoutUrl }
  }
`;

const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id checkoutUrl
        lines(first: 100) { edges { node { id merchandise { ... on ProductVariant { id } } } } }
      }
      userErrors { field message }
    }
  }
`;

const CART_LINES_ADD_MUTATION = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        id
        lines(first: 100) { edges { node { id merchandise { ... on ProductVariant { id } } } } }
      }
      userErrors { field message }
    }
  }
`;

const CART_LINES_UPDATE_MUTATION = `
  mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart { id }
      userErrors { field message }
    }
  }
`;

const CART_LINES_REMOVE_MUTATION = `
  mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart { id }
      userErrors { field message }
    }
  }
`;

function formatCheckoutUrl(checkoutUrl: string): string {
  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set("channel", "online_store");
    return url.toString();
  } catch {
    return checkoutUrl;
  }
}

function isCartNotFoundError(userErrors: Array<{ message: string }>): boolean {
  return userErrors.some(
    e =>
      e.message.toLowerCase().includes("cart not found") ||
      e.message.toLowerCase().includes("does not exist"),
  );
}

export async function shopifyCartCreate(
  variantId: string,
  quantity: number,
): Promise<{ cartId: string; checkoutUrl: string; lineId: string } | null> {
  const result = await storefrontApiRequest<any>(CART_CREATE_MUTATION, {
    input: { lines: [{ quantity, merchandiseId: variantId }] },
  });
  const errs = result?.data?.cartCreate?.userErrors ?? [];
  if (errs.length) {
    console.error("[Shopify] cartCreate errors:", errs);
    return null;
  }
  const cart = result?.data?.cartCreate?.cart;
  if (!cart?.checkoutUrl) return null;
  const lineId = cart.lines.edges[0]?.node?.id;
  if (!lineId) return null;
  return { cartId: cart.id, checkoutUrl: formatCheckoutUrl(cart.checkoutUrl), lineId };
}

export async function shopifyCartLinesAdd(
  cartId: string,
  variantId: string,
  quantity: number,
): Promise<{ success: boolean; lineId?: string; cartNotFound?: boolean }> {
  const result = await storefrontApiRequest<any>(CART_LINES_ADD_MUTATION, {
    cartId,
    lines: [{ quantity, merchandiseId: variantId }],
  });
  const errs = result?.data?.cartLinesAdd?.userErrors ?? [];
  if (isCartNotFoundError(errs)) return { success: false, cartNotFound: true };
  if (errs.length) {
    console.error("[Shopify] cartLinesAdd errors:", errs);
    return { success: false };
  }
  const lines = result?.data?.cartLinesAdd?.cart?.lines?.edges ?? [];
  const newLine = lines.find((l: any) => l.node.merchandise.id === variantId);
  return { success: true, lineId: newLine?.node?.id };
}

export async function shopifyCartLineUpdate(
  cartId: string,
  lineId: string,
  quantity: number,
): Promise<{ success: boolean; cartNotFound?: boolean }> {
  const result = await storefrontApiRequest<any>(CART_LINES_UPDATE_MUTATION, {
    cartId,
    lines: [{ id: lineId, quantity }],
  });
  const errs = result?.data?.cartLinesUpdate?.userErrors ?? [];
  if (isCartNotFoundError(errs)) return { success: false, cartNotFound: true };
  if (errs.length) {
    console.error("[Shopify] cartLinesUpdate errors:", errs);
    return { success: false };
  }
  return { success: true };
}

export async function shopifyCartLineRemove(
  cartId: string,
  lineId: string,
): Promise<{ success: boolean; cartNotFound?: boolean }> {
  const result = await storefrontApiRequest<any>(CART_LINES_REMOVE_MUTATION, {
    cartId,
    lineIds: [lineId],
  });
  const errs = result?.data?.cartLinesRemove?.userErrors ?? [];
  if (isCartNotFoundError(errs)) return { success: false, cartNotFound: true };
  if (errs.length) {
    console.error("[Shopify] cartLinesRemove errors:", errs);
    return { success: false };
  }
  return { success: true };
}

export async function shopifyCartFetch(cartId: string): Promise<{ totalQuantity: number; checkoutUrl: string } | null> {
  const result = await storefrontApiRequest<any>(CART_QUERY, { id: cartId });
  const cart = result?.data?.cart;
  if (!cart) return null;
  return {
    totalQuantity: cart.totalQuantity,
    checkoutUrl: formatCheckoutUrl(cart.checkoutUrl),
  };
}

const CART_DISCOUNT_CODES_UPDATE_MUTATION = `
  mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      cart { id discountCodes { code applicable } }
      userErrors { field message }
    }
  }
`;

/**
 * Apply (or replace) discount codes on the Shopify cart. Pass an empty array
 * to clear all codes. Returns the codes Shopify confirmed as applicable.
 */
export async function shopifyCartDiscountCodesUpdate(
  cartId: string,
  discountCodes: string[],
): Promise<{ success: boolean; applicable: string[]; cartNotFound?: boolean }> {
  const result = await storefrontApiRequest<any>(CART_DISCOUNT_CODES_UPDATE_MUTATION, {
    cartId,
    discountCodes,
  });
  const errs = result?.data?.cartDiscountCodesUpdate?.userErrors ?? [];
  if (isCartNotFoundError(errs)) return { success: false, applicable: [], cartNotFound: true };
  if (errs.length) {
    console.error("[Shopify] cartDiscountCodesUpdate errors:", errs);
    return { success: false, applicable: [] };
  }
  const codes = result?.data?.cartDiscountCodesUpdate?.cart?.discountCodes ?? [];
  return {
    success: true,
    applicable: codes.filter((c: any) => c.applicable).map((c: any) => c.code),
  };
}

/* -------------------------------------------------------------------------- */
/* Vinoshipper deep-link helper                                               */
/* -------------------------------------------------------------------------- */

export function buildVinoshipperCheckoutUrl(items: CartItem[]): string | null {
  const wineItems = items.filter(i => i.product.node.productKind === "wine");
  if (wineItems.length === 0) return null;
  const first = wineItems[0].product.node.vinoshipperCartUrl;
  if (first) return first;
  return "https://vinoshipper.com/shop/rescue_dog_wines";
}

/* -------------------------------------------------------------------------- */
/* Legacy no-op exports kept for API compatibility with older imports         */
/* -------------------------------------------------------------------------- */

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
export const STOREFRONT_PRODUCTS_QUERY = "";
export const STOREFRONT_PRODUCT_BY_HANDLE_QUERY = "";
export { storefrontApiRequest };
