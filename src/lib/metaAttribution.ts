/**
 * Meta (Facebook) attribution helper.
 *
 * Captures `fbclid` from the URL on landing and writes the `_fbc` cookie in
 * Meta's required format so that Vinoshipper (or any downstream checkout)
 * can pass it server-side via the Conversions API.
 *
 * Format spec: `fb.{subdomainIndex}.{creationTimestampMs}.{fbclid}`
 *  - subdomainIndex: 1 for root domain (e.g. rescuedogwines.com)
 *  - creationTimestampMs: Date.now()
 *  - fbclid: raw value from the URL param
 *
 * Also preserves `_fbp` (browser pixel ID) if Meta Pixel hasn't set one yet —
 * we leave that to the Pixel itself; this helper only handles `_fbc`.
 */

const FBC_COOKIE = "_fbc";
const COOKIE_MAX_AGE_DAYS = 90; // Meta's default attribution window
const GCLAW_COOKIE = "gclaw"; // Google Ads click ID cookie (gclid wrapper)

function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // Set on root domain so subdomains share it (checkout.rescuedogwines.com etc.)
  const host = window.location.hostname;
  const rootDomain = host.split(".").slice(-2).join(".");
  const domainAttr = host === "localhost" ? "" : `; domain=.${rootDomain}`;
  document.cookie = `${name}=${value}; expires=${expires}; path=/${domainAttr}; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Read `fbclid` from the current URL and persist `_fbc` if not already set
 * (or if the incoming click is fresher). Safe to call on every page load.
 */
export function captureFbclid(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get("fbclid");
    if (!fbclid) return;

    const existing = getCookie(FBC_COOKIE);
    // If existing cookie has the same fbclid, don't refresh the timestamp
    if (existing && existing.endsWith(`.${fbclid}`)) return;

    const value = `fb.1.${Date.now()}.${fbclid}`;
    setCookie(FBC_COOKIE, value, COOKIE_MAX_AGE_DAYS);
  } catch (e) {
    // Never throw — attribution is best-effort
    console.warn("[meta-attribution] capture failed", e);
  }
}

/** Read the current `_fbc` value (for sending to backend / CAPI). */
export function getFbc(): string | null {
  return getCookie(FBC_COOKIE);
}

/** Read the `_fbp` value set by Meta Pixel (browser ID). */
export function getFbp(): string | null {
  return getCookie("_fbp");
}

// ────────────────────────────────────────────────────────────────────────────
// Google Ads attribution (gclid → `gclaw` cookie)
//
// Mirrors the Meta bridge so Z3 / Google Ads offline conversion uploads have
// a reliable click ID even when GTM Tag 92 (which appends `?gclid=` to VS
// checkout links) misses or fires late. Format: `GCL.{seconds}.{gclid}`
// (Google uses seconds, not ms, unlike Meta's `_fbc`).
// ────────────────────────────────────────────────────────────────────────────

export function captureGclid(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const gclid = params.get("gclid");
    if (!gclid) return;

    const existing = getCookie(GCLAW_COOKIE);
    if (existing && existing.endsWith(`.${gclid}`)) return;

    const value = `GCL.${Math.floor(Date.now() / 1000)}.${gclid}`;
    setCookie(GCLAW_COOKIE, value, COOKIE_MAX_AGE_DAYS);
  } catch (e) {
    console.warn("[google-attribution] capture failed", e);
  }
}

/** Read the raw `gclid` from the `gclaw` cookie (returns just the click id). */
export function getGclid(): string | null {
  const raw = getCookie(GCLAW_COOKIE);
  if (!raw) return null;
  // Format: GCL.{seconds}.{gclid}
  const parts = raw.split(".");
  return parts.length >= 3 ? parts.slice(2).join(".") : null;
}

/** Read the full `gclaw` cookie value (for passing through to backend). */
export function getGclaw(): string | null {
  return getCookie(GCLAW_COOKIE);
}
