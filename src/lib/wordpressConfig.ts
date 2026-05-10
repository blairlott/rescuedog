/**
 * WordPress (self-hosted on Cloudways) integration.
 *
 * Until live WP credentials are wired (see post-vs-golive plan), the site
 * runs in WP_SIMULATION = true mode: a built-in mock dataset returns the
 * same JSON shape the real WP REST API would return. Components use the
 * exact same hooks; flipping the flag swaps mocks for real fetches.
 *
 * Read-only endpoints we will hit (REST):
 *   GET  {WP_BASE}/wp-json/wp/v2/pages?slug={slug}
 *   GET  {WP_BASE}/wp-json/wp/v2/posts?per_page=10&_embed
 *   GET  {WP_BASE}/wp-json/wp/v2/posts/{id}?_embed
 *   GET  {WP_BASE}/wp-json/wp/v2/wines?slug={sku}        (custom post type)
 *
 * Write endpoints (admin only; called from edge functions, never client):
 *   POST {WP_BASE}/wp-json/wp/v2/posts   (Application Password basic-auth)
 */
export const WP_SIMULATION = true;

/** Set when going live (e.g. https://staging.rescuedogwines.com). */
export const WP_BASE_URL = "";

/** Custom post type slug for wine product copy joined by SKU. */
export const WP_WINE_CPT = "wines";

/** Front-end "merch backend" toggle: 'shopify' (today) | 'vinoshipper' | 'woo'. */
export type MerchBackend = "shopify" | "vinoshipper" | "woo";
export const MERCH_BACKEND: MerchBackend = "shopify";

export const wpUrl = (path: string) =>
  `${WP_BASE_URL.replace(/\/$/, "")}/wp-json${path.startsWith("/") ? "" : "/"}${path}`;