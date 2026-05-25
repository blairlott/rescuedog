// Browser-safe key. Prefer the Lovable Google Maps connector's referrer-
// restricted browser key. Falls back to a project-managed key only when the
// connector isn't connected. NEVER use this key for server-side APIs
// (Geocoding, Routes, Directions) — those go through the google-maps-proxy
// edge function so requests run with a server-side, IP-or-referrer-restricted
// key managed in the connector gateway.
export const GOOGLE_MAPS_BROWSER_KEY: string =
  (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined) ?? "";

/** @deprecated Use GOOGLE_MAPS_BROWSER_KEY for browser surfaces and the
 *  `google-maps-proxy` edge function for Geocoding / Routes. */
export const GOOGLE_MAPS_API_KEY = GOOGLE_MAPS_BROWSER_KEY;

/** Domains the Lovable-managed browser key is allowed to load from.
 *  Custom domains require their own key (see Connectors → Google Maps). */
const ALLOWED_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com"];

let _checked = false;

/**
 * Runtime check: warns once if the current page is loaded from a host that
 * is not on the referrer allowlist for the managed Google Maps browser key.
 * Safe to call from anywhere in the React tree (no-op on the server / SSR).
 */
export function assertAllowedMapsReferrer(extraAllowed: string[] = []): {
  ok: boolean;
  host: string;
  reason?: string;
} {
  if (typeof window === "undefined") return { ok: true, host: "" };
  const host = window.location.hostname;

  // localhost is fine in dev (the managed key just won't render maps, but
  // server-proxied calls still work).
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  const allowedSuffixes = [...ALLOWED_HOST_SUFFIXES, ...extraAllowed];
  const matchesAllowed = allowedSuffixes.some((s) =>
    s.startsWith(".") ? host.endsWith(s) || host === s.slice(1) : host === s,
  );

  const ok = isLocal || matchesAllowed;
  if (!ok && !_checked) {
    _checked = true;
    const reason = `Google Maps browser key is referrer-restricted to ${allowedSuffixes.join(
      ", ",
    )}. Current host "${host}" is NOT on the allowlist — Maps JS API will return REQUEST_DENIED. Connect a custom Google Maps API key with this domain on its HTTP-referrer allowlist (Connectors → Google Maps).`;
    // eslint-disable-next-line no-console
    console.warn("[google-maps]", reason);
    return { ok: false, host, reason };
  }
  return { ok, host };
}

/** True iff a browser key is available. */
export function hasBrowserKey(): boolean {
  return GOOGLE_MAPS_BROWSER_KEY.length > 0;
}
