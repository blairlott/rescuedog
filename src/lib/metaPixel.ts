/**
 * Meta Pixel bootstrap.
 *
 * Loads `fbevents.js`, initializes the pixel, fires PageView on init and on
 * every SPA route change. This is what makes `_fbp` get set on every visitor
 * and `_fbc` enriched after an `fbclid` landing — both of which the
 * Conversions API needs for high Event Match Quality.
 *
 * The Pixel ID is fetched from the `meta-pixel-config` edge function so we
 * don't hardcode it in source. Pixel IDs are publishable.
 *
 * Browser-side Purchase fire (`trackPurchase`) sends the same `event_id` as
 * the server CAPI call so Meta dedupes the pair.
 */
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: unknown;
  }
}

let initPromise: Promise<string | null> | null = null;

function injectFbevents() {
  if (typeof window === "undefined" || window.fbq) return;
  // Standard Meta Pixel base snippet, rewritten for TS.
  /* eslint-disable */
  (function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode!.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
}

/**
 * Initialize the pixel. Idempotent. Returns the pixel id (or null if disabled).
 */
export function initMetaPixel(): Promise<string | null> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("meta-pixel-config", { method: "GET" });
      if (error || !data?.pixelId) return null;
      const pixelId = String(data.pixelId);
      injectFbevents();
      window.fbq?.("init", pixelId);
      window.fbq?.("track", "PageView");
      return pixelId;
    } catch (e) {
      console.warn("[meta-pixel] init failed", e);
      return null;
    }
  })();
  return initPromise;
}

/** Fire PageView on SPA route change. Safe no-op if pixel not yet booted. */
export function trackPageView() {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "PageView");
}

/**
 * Browser-side Purchase event. Pass the SAME `eventId` (== order id) that the
 * server CAPI call uses so Meta can dedupe the pair.
 */
export function trackPurchase(opts: {
  eventId: string;
  value: number;
  currency?: string;
  contentIds?: string[];
}) {
  if (typeof window === "undefined") return;
  try {
    window.fbq?.(
      "track",
      "Purchase",
      {
        value: opts.value,
        currency: opts.currency ?? "USD",
        ...(opts.contentIds?.length ? { content_ids: opts.contentIds, content_type: "product" } : {}),
      },
      { eventID: opts.eventId },
    );
  } catch (e) {
    console.warn("[meta-pixel] trackPurchase failed", e);
  }
}

/** Generic event helper for Lead/Subscribe/etc. */
export function trackEvent(eventName: string, params?: Record<string, unknown>, eventId?: string) {
  if (typeof window === "undefined") return;
  try {
    if (eventId) window.fbq?.("track", eventName, params ?? {}, { eventID: eventId });
    else window.fbq?.("track", eventName, params ?? {});
  } catch (e) {
    console.warn("[meta-pixel] trackEvent failed", eventName, e);
  }
}