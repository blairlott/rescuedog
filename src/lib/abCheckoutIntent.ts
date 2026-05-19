/**
 * Records the visitor's site_variant + GA4/gclid attribution right before
 * the Vinoshipper handoff so the webhook can stitch the completed `purchase`
 * back to the correct A/B arm.
 *
 * Fire-and-forget. Never blocks checkout.
 */
import { supabase } from "@/integrations/supabase/client";
import { AB_META, getGa4ClientId, getStoredGclid, getVariant } from "@/lib/abVariant";

export interface RecordIntentInput {
  email?: string | null;
  cartId?: string | null;
}

export async function recordCheckoutIntent(input: RecordIntentInput): Promise<void> {
  try {
    const variant = getVariant();
    const ga4 = getGa4ClientId();
    const gclid = getStoredGclid();
    const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null;
    await supabase.from("ab_checkout_intents").insert({
      email: (input.email ?? null)?.toLowerCase().trim() || null,
      cart_id: input.cartId ?? null,
      site_variant: variant,
      ab_test: AB_META.AB_TEST_ID,
      ga4_client_id: ga4,
      gclid,
      user_agent: ua,
    });
  } catch (e) {
    // Never let attribution break checkout.
    if (typeof console !== "undefined") console.warn("[ab-intent] record failed", e);
  }
}