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
