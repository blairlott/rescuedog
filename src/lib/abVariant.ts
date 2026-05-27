/**
 * Lovable-side handshake for the WP <-> Lovable A/B test.
 *
 * The WordPress site (Cloudways dev) sets a sticky `rdw_variant_dev` cookie
 * and may redirect bucket B visitors to this Lovable origin. When they land
 * here we:
 *  1. Read the cookie. If missing (visitor came direct, not via WP), default
 *     to "lovable" and persist so subsequent visits stay sticky.
 *  2. Push `site_variant` + `ab_test` to dataLayer so GA4 / GTM see the same
 *     dimension on both stacks.
 *  3. Expose helpers for the admin QA tile (force / clear).
 *
 * NOTE: Cookie name is intentionally `rdw_variant_dev` to match the dev WP
 * snippet. When we promote to production, swap both sides to `rdw_variant`.
 */

const COOKIE_NAME = "rdw_variant_dev";
const AB_TEST_ID = "rdw_replatform_dev";
const COOKIE_DAYS = 30;

export type Variant = "lovable" | "legacy";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string, days = COOKIE_DAYS) {
  if (typeof document === "undefined") return;
  const exp = new Date(Date.now() + days * 86400 * 1000).toUTCString();
  // Domain omitted so the cookie scopes to current host. Both WP and Lovable
  // set their own copy; the WP cookie travels with the redirect via URL
  // params would be nicer but for the dev test cookie-per-host is fine.
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Expires=${exp}; Secure; SameSite=Lax`;
}

function pushDataLayer(variant: Variant) {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as { dataLayer?: Array<Record<string, unknown>> };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ site_variant: variant, ab_test: AB_TEST_ID });
  } catch {
    /* never let analytics break the app */
  }
}

export function getVariant(): Variant {
  const v = readCookie(COOKIE_NAME);
  return v === "legacy" ? "legacy" : "lovable";
}

/** Called once on app boot. Idempotent. */
export function initVariantHandshake(): Variant {
  let v = readCookie(COOKIE_NAME) as Variant | null;
  if (v !== "lovable" && v !== "legacy") {
    // Direct hit on Lovable (not via WP redirect) → default to lovable + persist.
    v = "lovable";
    writeCookie(COOKIE_NAME, v);
  }
  pushDataLayer(v);
  return v;
}

/** QA: force a bucket and re-emit dataLayer. */
export function forceVariant(v: Variant) {
  writeCookie(COOKIE_NAME, v);
  pushDataLayer(v);
}

/** QA: clear the cookie so the next WP visit re-buckets fresh. */
export function clearVariant() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export const AB_META = { COOKIE_NAME, AB_TEST_ID } as const;

/**
 * Read GA4's `_ga` client_id cookie so we can stitch server-side conversions
 * back to the same browser. Format: GA1.1.<client_id>.<timestamp>. We return
 * the `<client_id>.<timestamp>` portion which is what MP /collect expects.
 */
export function getGa4ClientId(): string | null {
  const raw = readCookie("_ga");
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 4) return null;
  return `${parts[2]}.${parts[3]}`;
}

/** Read the gclid we stashed during ad-click capture (see metaAttribution).
 *  Re-exported from metaAttribution so we unwrap "GCL.{seconds}.{gclid}"
 *  and never insert the wrapper string into ab_checkout_intents. */
export { getGclid as getStoredGclid } from "@/lib/metaAttribution";