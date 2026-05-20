/**
 * Internal / test accounts whose traffic must NOT trigger paid-media signals
 * (GA4, Meta Pixel/CAPI, TikTok, Pinterest) or A/B exposure events.
 *
 * Used by:
 *  - `src/lib/analytics.ts` (client GTM dataLayer push is suppressed)
 *  - `supabase/functions/_shared/internalUsers.ts` (server-side mirror,
 *     short-circuits Meta CAPI + GA4 Measurement Protocol)
 *
 * Suppression triggers when ANY of these are true:
 *  1. Logged-in customer email matches the list (set via setInternalUserEmail)
 *  2. `localStorage.rdw_internal === "1"` (manual opt-out for shared devices)
 *  3. URL contains `?internal=1` on any page load (persists to localStorage)
 */

export const INTERNAL_EMAILS: ReadonlySet<string> = new Set([
  "blair.lott@gmail.com",
  "info@rescuedogwines.com",
]);

const LS_KEY = "rdw_internal";

export function isInternalEmail(email?: string | null): boolean {
  if (!email) return false;
  return INTERNAL_EMAILS.has(email.trim().toLowerCase());
}

let cachedEmail: string | null = null;

export function setInternalUserEmail(email: string | null) {
  cachedEmail = email ? email.trim().toLowerCase() : null;
  if (typeof window === "undefined") return;
  try {
    if (cachedEmail && isInternalEmail(cachedEmail)) {
      window.localStorage.setItem(LS_KEY, "1");
    }
  } catch { /* ignore */ }
}

/** Returns true if the current visitor should be excluded from ad signals. */
export function isInternalVisitor(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // URL override
    const url = new URL(window.location.href);
    if (url.searchParams.get("internal") === "1") {
      window.localStorage.setItem(LS_KEY, "1");
      return true;
    }
    if (url.searchParams.get("internal") === "0") {
      window.localStorage.removeItem(LS_KEY);
      cachedEmail = null;
      return false;
    }
    if (window.localStorage.getItem(LS_KEY) === "1") return true;
    if (cachedEmail && isInternalEmail(cachedEmail)) return true;
    return false;
  } catch {
    return cachedEmail !== null && isInternalEmail(cachedEmail);
  }
}