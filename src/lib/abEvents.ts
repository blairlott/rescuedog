/**
 * Fire-and-forget logger for the in-app A/B results dashboard
 * (/admin/ab-results). Pairs with `ab_checkout_intents` to give us a
 * variant-by-variant funnel: pageview -> add_to_cart -> checkout_intent.
 *
 * Never throws; never blocks the UI.
 */
import { supabase } from "@/integrations/supabase/client";
import { AB_META, getVariant } from "@/lib/abVariant";

type AbEventType = "pageview" | "add_to_cart";

const SESSION_KEY = "rdw_ab_session";

function getSessionId(): string {
  if (typeof sessionStorage === "undefined") return "";
  let s = sessionStorage.getItem(SESSION_KEY);
  if (!s) {
    s =
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
    sessionStorage.setItem(SESSION_KEY, s);
  }
  return s;
}

export function logAbEvent(
  event_type: AbEventType,
  opts: { path?: string; valueCents?: number } = {},
): void {
  try {
    void supabase.from("ab_events").insert({
      event_type,
      site_variant: getVariant(),
      ab_test: AB_META.AB_TEST_ID,
      session_id: getSessionId(),
      path:
        opts.path ??
        (typeof window !== "undefined" ? window.location.pathname : null),
      value_cents: opts.valueCents ?? null,
    });
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[ab-event] failed", e);
  }
}