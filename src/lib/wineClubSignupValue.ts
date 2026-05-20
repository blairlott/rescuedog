/**
 * Wine Club signup monetary value — used for ad platform optimization signals
 * (Meta OUTCOME_LEADS lead value, Google Ads conversion value, etc.).
 *
 * We deliberately separate two numbers:
 *
 *   1. `lead_value`         — what to send on the Lead / CompleteRegistration
 *                              event so the bidding algo learns. We use the
 *                              FIRST-SHIPMENT NET MARGIN (avg tier price ×
 *                              gross margin). This is conservative and stays
 *                              within Meta's policy of using realistic value
 *                              for a single conversion. Sending full LTV here
 *                              inflates bids and burns budget.
 *
 *   2. `predicted_ltv`      — what to send as `predicted_ltv` (or use as the
 *                              ceiling for tCPA bidding). This compounds avg
 *                              tier price × retention_months × gross_margin.
 *
 * Defaults are tuned conservatively so the first batch of ads doesn't overbid:
 *   - retention_months = 6   (most clubs see meaningful churn after 6 shipments)
 *   - gross_margin     = 0.55
 *
 * All three knobs can be overridden via `app_settings` keys:
 *   - wine_club_signup_lead_value_cents
 *   - wine_club_retention_months
 *   - wine_club_gross_margin_pct
 */

import { supabase } from "@/integrations/supabase/client";

export interface WineClubSignupValue {
  lead_value_usd: number;
  predicted_ltv_usd: number;
  avg_tier_price_usd: number;
  retention_months: number;
  gross_margin_pct: number;
  target_cpl_max_usd: number;
  source: "app_settings_override" | "computed";
  currency: "USD";
  methodology: string;
}

export const DEFAULT_RETENTION_MONTHS = 6;
export const DEFAULT_GROSS_MARGIN = 0.55;
/** Spend up to this fraction of predicted LTV per acquired lead. */
export const TARGET_CPL_FRACTION_OF_LTV = 0.15;

export async function computeWineClubSignupValue(): Promise<WineClubSignupValue> {
  const [tiersRes, membersRes, settingsRes] = await Promise.all([
    supabase.from("wine_club_tiers" as any).select("id, price_cents, is_active"),
    supabase.from("wine_club_memberships" as any).select("tier_id, status"),
    supabase.from("app_settings" as any).select("key, value").in("key", [
      "wine_club_signup_lead_value_cents",
      "wine_club_retention_months",
      "wine_club_gross_margin_pct",
    ]),
  ]);

  const tiers = ((tiersRes.data as any) || []) as { id: string; price_cents: number; is_active: boolean }[];
  const members = ((membersRes.data as any) || []) as { tier_id: string; status: string }[];
  const settings = ((settingsRes.data as any) || []) as { key: string; value: any }[];
  const settingMap = new Map(settings.map(s => [s.key, s.value]));

  const retention_months = Number(settingMap.get("wine_club_retention_months") ?? DEFAULT_RETENTION_MONTHS) || DEFAULT_RETENTION_MONTHS;
  const gross_margin_pct = Number(settingMap.get("wine_club_gross_margin_pct") ?? DEFAULT_GROSS_MARGIN) || DEFAULT_GROSS_MARGIN;

  // Average tier weighted by current active members; fall back to active tiers; fall back to all tiers.
  const tierPrice = new Map(tiers.map(t => [t.id, t.price_cents]));
  const activeMembers = members.filter(m => m.status === "active");
  let avgCents = 0;
  if (activeMembers.length > 0) {
    const total = activeMembers.reduce((s, m) => s + (tierPrice.get(m.tier_id) ?? 0), 0);
    avgCents = total / activeMembers.length;
  } else {
    const pool = tiers.filter(t => t.is_active);
    const src = pool.length > 0 ? pool : tiers;
    avgCents = src.length > 0 ? src.reduce((s, t) => s + t.price_cents, 0) / src.length : 0;
  }
  const avg_tier_price_usd = avgCents / 100;

  const override = settingMap.get("wine_club_signup_lead_value_cents");
  const overrideUsd = override != null ? Number(override) / 100 : null;

  const computedLeadValue = +(avg_tier_price_usd * gross_margin_pct).toFixed(2);
  const lead_value_usd = overrideUsd != null && overrideUsd > 0 ? overrideUsd : computedLeadValue;
  const predicted_ltv_usd = +(avg_tier_price_usd * retention_months * gross_margin_pct).toFixed(2);
  const target_cpl_max_usd = Math.max(8, +(predicted_ltv_usd * TARGET_CPL_FRACTION_OF_LTV).toFixed(2));

  return {
    lead_value_usd,
    predicted_ltv_usd,
    avg_tier_price_usd: +avg_tier_price_usd.toFixed(2),
    retention_months,
    gross_margin_pct,
    target_cpl_max_usd,
    source: overrideUsd != null && overrideUsd > 0 ? "app_settings_override" : "computed",
    currency: "USD",
    methodology:
      overrideUsd != null && overrideUsd > 0
        ? `Override from app_settings.wine_club_signup_lead_value_cents = $${overrideUsd.toFixed(2)}.`
        : `Avg active tier $${avg_tier_price_usd.toFixed(2)} × gross margin ${(gross_margin_pct * 100).toFixed(0)}% = $${computedLeadValue.toFixed(2)} (one-shipment net). Predicted LTV multiplies by ${retention_months}-month retention.`,
  };
}