import { ShopifyProduct } from "@/lib/shopify";

const WINE_REGEX = /cabernet|pinot|chardonnay|rosé|rose|sauvignon|sparkling|blend|méthode|demi|sampler|\b\d+\s*(?:bottle|btl|pack|-pack)\b/i;

export function isWineProduct(product: ShopifyProduct): boolean {
  const title = product.node.title.toLowerCase();
  if (title.includes('wine')) return true;
  if (WINE_REGEX.test(title)) return true;
  // Tag-based fallback: anything tagged 'wine' is wine; anything tagged
  // 'merch'/'apparel'/'drinkware'/'pet'/'home'/'gift' is NOT wine.
  const tags = (product.node.tags || []).map((t) => t.toLowerCase());
  if (tags.includes('wine')) return true;
  return false;
}

export function isRescueDogDomain(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'rescuedog.com' || hostname === 'www.rescuedog.com';
}
