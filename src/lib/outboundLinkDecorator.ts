/**
 * Outbound link decorator — Vinoshipper handoff.
 *
 * GTM Tag 92 (Vinoshipper container GTM-5DBQXWP7) appends `?gclid=` to outbound
 * VS links, but only on rescuedogwines.com pageviews where the container loads
 * in time AND the user hasn't already navigated. On our Lovable-hosted
 * properties (preview, *.lovable.app) and on cold-cache page loads, that tag
 * misses — VS-hosted checkout starts a fresh session with no click ID, so
 * Google Ads / Meta CAPI offline-conversion uploads break.
 *
 * This decorator captures the click on every outbound anchor pointing at
 * vinoshipper.com (and a few well-known subdomains) and rewrites the href to
 * include the persisted click IDs + UTM params just before the navigation
 * happens. Runs in the capture phase so it beats React onClick handlers and
 * also covers middle-click / cmd-click / right-click "Open in new tab".
 *
 * Idempotent: if the link already has `gclid` / `fbclid` / matching `utm_*`
 * we leave them alone (publisher-supplied wins).
 */

import { getGclid, getFbc } from "@/lib/metaAttribution";

const VS_HOSTNAMES = [
  "vinoshipper.com",
  "www.vinoshipper.com",
  "shop.vinoshipper.com",
  "checkout.vinoshipper.com",
];

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

const UTM_STORAGE_KEY = "rdw_utm";

function isVinoshipperHost(host: string): boolean {
  const h = host.toLowerCase();
  return VS_HOSTNAMES.includes(h) || h.endsWith(".vinoshipper.com");
}

/** Persist any utm_* params present on the landing URL into sessionStorage. */
function captureUtmParams(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const captured: Record<string, string> = {};
    for (const key of UTM_KEYS) {
      const v = params.get(key);
      if (v) captured[key] = v;
    }
    if (Object.keys(captured).length === 0) return;
    // Merge with any previously captured set so later visits don't wipe a
    // first-touch source if the user lands twice in the same session.
    const prev = readUtmParams();
    const merged = { ...captured, ...prev }; // prev wins (first-touch)
    window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.warn("[outbound-decorator] utm capture failed", e);
  }
}

function readUtmParams(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Build the decorated URL. Returns the same href if nothing to add. */
export function decorateVinoshipperUrl(href: string): string {
  try {
    const url = new URL(href, window.location.href);
    if (!isVinoshipperHost(url.hostname)) return href;

    let mutated = false;

    const gclid = getGclid();
    if (gclid && !url.searchParams.has("gclid")) {
      url.searchParams.set("gclid", gclid);
      mutated = true;
    }

    // Pass Meta click ID through as `fbclid` so VS's own session capture +
    // CAPI bridge can pick it up. _fbc cookie format is `fb.1.{ts}.{fbclid}`.
    const fbc = getFbc();
    if (fbc && !url.searchParams.has("fbclid")) {
      const parts = fbc.split(".");
      const fbclid = parts.length >= 4 ? parts.slice(3).join(".") : null;
      if (fbclid) {
        url.searchParams.set("fbclid", fbclid);
        mutated = true;
      }
    }

    const utm = readUtmParams();
    for (const key of UTM_KEYS) {
      if (utm[key] && !url.searchParams.has(key)) {
        url.searchParams.set(key, utm[key]);
        mutated = true;
      }
    }

    return mutated ? url.toString() : href;
  } catch {
    return href;
  }
}

function findOutboundAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const a = target.closest("a[href]") as HTMLAnchorElement | null;
  if (!a) return null;
  const href = a.getAttribute("href");
  if (!href) return null;
  try {
    const url = new URL(href, window.location.href);
    return isVinoshipperHost(url.hostname) ? a : null;
  } catch {
    return null;
  }
}

function decorateAnchorInPlace(a: HTMLAnchorElement): void {
  const current = a.getAttribute("href");
  if (!current) return;
  const next = decorateVinoshipperUrl(current);
  if (next !== current) a.setAttribute("href", next);
}

/**
 * Install global capture-phase listeners that rewrite outbound VS hrefs just
 * in time — covers left click, middle/aux click, ctrl/cmd+click, and the
 * right-click "Copy link / Open in new tab" path via contextmenu.
 */
export function initOutboundLinkDecorator(): void {
  if (typeof window === "undefined") return;
  if ((window as any).__rdwOutboundDecorator) return;
  (window as any).__rdwOutboundDecorator = true;

  captureUtmParams();

  const handler = (e: Event) => {
    const a = findOutboundAnchor(e.target);
    if (a) decorateAnchorInPlace(a);
  };

  // Use capture so we run before any React onClick that might call e.preventDefault.
  window.addEventListener("pointerdown", handler, true);
  window.addEventListener("auxclick", handler, true);
  window.addEventListener("contextmenu", handler, true);
  // Also catch keyboard-activated clicks (Enter on focused anchor).
  window.addEventListener("click", handler, true);
}