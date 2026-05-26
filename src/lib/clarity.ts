// Microsoft Clarity helper. The actual tracking snippet lives in
// index.html (gated to production hostnames). This module exposes
// thin wrappers so the React app can:
//   • set custom tags on the session (page type, member tier, ad source)
//   • identify a user once they log in (hashed user id only — never PII)
//   • flag the session as a converter when the user submits a paid order
//
// All calls no-op safely when Clarity isn't loaded (dev / preview / blocked).

export const CLARITY_PROJECT_ID = "wwwsh4moal";

type ClarityFn = (...args: any[]) => void;

function clarity(): ClarityFn | null {
  if (typeof window === "undefined") return null;
  const c = (window as any).clarity;
  return typeof c === "function" ? c : null;
}

/** Tag the current session with a key/value (filterable in Clarity). */
export function setClarityTag(key: string, value: string | string[]) {
  try { clarity()?.("set", key, value); } catch { /* noop */ }
}

/** Flag the session as an event of interest (e.g. "wine_club_join_click"). */
export function clarityEvent(name: string) {
  try { clarity()?.("event", name); } catch { /* noop */ }
}

/** Tie the session to a stable hashed user id (never raw email). */
export function identifyClarity(hashedUserId: string, friendlyName?: string) {
  try { clarity()?.("identify", hashedUserId, undefined, undefined, friendlyName); } catch { /* noop */ }
}

/** Convenience: tag UTM params + age-gate + auth state on first paint. */
export function tagDefaultClaritySession(opts: {
  ageGatePassed?: boolean;
  loggedIn?: boolean;
  packTier?: string | null;
}) {
  try {
    const p = new URLSearchParams(window.location.search);
    const src = p.get("utm_source");
    const med = p.get("utm_medium");
    const cmp = p.get("utm_campaign");
    if (src) setClarityTag("utm_source", src);
    if (med) setClarityTag("utm_medium", med);
    if (cmp) setClarityTag("utm_campaign", cmp);
    setClarityTag("age_gate_passed", opts.ageGatePassed ? "yes" : "no");
    setClarityTag("auth_state", opts.loggedIn ? "logged_in" : "guest");
    if (opts.packTier) setClarityTag("pack_tier", opts.packTier);
    setClarityTag("surface", window.location.pathname.startsWith("/merch") ? "merch" : "wine");
  } catch { /* noop */ }
}

/** Deep-link helpers for the CMS Integrations card. */
export const clarityUrls = {
  dashboard: `https://clarity.microsoft.com/projects/view/${CLARITY_PROJECT_ID}/dashboard`,
  heatmaps: `https://clarity.microsoft.com/projects/view/${CLARITY_PROJECT_ID}/heatmaps`,
  recordings: `https://clarity.microsoft.com/projects/view/${CLARITY_PROJECT_ID}/recordings`,
  settings: `https://clarity.microsoft.com/projects/view/${CLARITY_PROJECT_ID}/settings`,
};