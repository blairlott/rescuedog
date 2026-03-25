import { ShopifyProduct } from "@/lib/shopify";

const WINE_REGEX = /cabernet|pinot|chardonnay|rosé|rose|sauvignon|sparkling|blend|méthode|demi|sampler/i;

export function isWineProduct(product: ShopifyProduct): boolean {
  const title = product.node.title.toLowerCase();
  return title.includes('wine') || WINE_REGEX.test(title);
}

export function isRescueDogDomain(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'rescuedog.com' || hostname === 'www.rescuedog.com';
}
