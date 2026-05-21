// Creates a Meta campaign + 2 adsets (Purchase / Subscribe A/B) + 2 ads
// for a single IG post, then logs both variants to ig_boost_log.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_TOKEN = Deno.env.get("META_SYSTEM_USER_TOKEN") ?? Deno.env.get("META_ADS_ACCESS_TOKEN")!;
const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function metaPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: META_TOKEN }),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: j };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const payload = await req.json().catch(() => ({}));
  const post_id: string = payload.post_id;
  const trigger_value: number = Number(payload.trigger_value ?? 0);
  const triggered_by: string = payload.triggered_by ?? "unknown";
  if (!post_id) return json({ ok: false, error: "missing post_id" }, 400);

  const { data: cfg } = await admin.from("ig_boost_config").select("*").limit(1).maybeSingle();
  if (!cfg) return json({ ok: false, error: "config missing" }, 500);

  // Idempotency
  const { data: existing } = await admin
    .from("ig_boost_log").select("id").eq("post_id", post_id).limit(1);
  if (existing && existing.length > 0) {
    return json({ ok: true, skipped: "already_boosted", post_id });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const acct = cfg.meta_ad_account_id;

  // ---- A/B objective assignment: alternate across posts ----
  // Default rotates evenly; if a winner has been declared and saved to
  // ig_boost_config.default_objective, use it for every new post.
  let assigned_variant: "conversion" | "wine_club";
  if (cfg.default_objective === "conversion" || cfg.default_objective === "wine_club") {
    assigned_variant = cfg.default_objective;
  } else {
    const { count: priorCount } = await admin
      .from("ig_boost_log")
      .select("post_id", { count: "exact", head: true });
    assigned_variant = ((priorCount ?? 0) % 2 === 0) ? "conversion" : "wine_club";
  }
  const variant = assigned_variant === "conversion"
    ? { variant: "conversion" as const, suffix: "Purchase", event: "PURCHASE" }
    : { variant: "wine_club"  as const, suffix: "WineClub", event: "SUBSCRIBE" };

  // ---- Daily total spend cap across all active boosts ----
  const { data: activeBudgets } = await admin
    .from("ig_boost_log")
    .select("daily_budget_cents")
    .eq("status", "active");
  const activeTotalCents = (activeBudgets ?? [])
    .reduce((s, r: any) => s + Number(r.daily_budget_cents ?? 0), 0);
  const newBudgetCents = Number(cfg.daily_budget_per_variant_cents);
  const capCents = Number(cfg.daily_total_cap_cents ?? 2500);
  if (activeTotalCents + newBudgetCents > capCents) {
    await admin.from("ig_boost_log").insert({
      post_id, triggered_by, trigger_value, test_variant: variant.variant,
      status: "killed",
      kill_reason: `daily_cap_reached: active=${activeTotalCents}c + new=${newBudgetCents}c > cap=${capCents}c`,
      daily_budget_cents: newBudgetCents,
    });
    return json({
      ok: false, skipped: "daily_cap_reached",
      post_id, variant: variant.variant,
      active_total_cents: activeTotalCents, cap_cents: capCents,
    }, 200);
  }

  // 1. Campaign
  const campaignRes = await metaPost(`${acct}/campaigns`, {
    name: `IGBoost_${post_id}_${variant.suffix}_${dateStr}`,
    objective: "OUTCOME_SALES",
    status: "ACTIVE",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  });
  if (!campaignRes.ok) return json({ ok: false, step: "campaign", ...campaignRes }, 502);
  const campaign_id: string = campaignRes.body.id;

  const targeting = {
    age_min: 25,
    age_max: 65,
    geo_locations: { countries: ["US"] },
    excluded_geo_locations: {
      regions: (cfg.excluded_region_keys as string[]).map((k) => ({ key: k })),
    },
    custom_audiences: [
      { id: cfg.purchase_audience_id },
      { id: cfg.lal_1pct_audience_id },
      { id: cfg.lal_high_ltv_audience_id },
    ],
    targeting_automation: { advantage_audience: 1 },
  };

  const results: any[] = [];

  {
    const v = variant;
    const adsetRes = await metaPost(`${acct}/adsets`, {
      name: `IGBoost_${post_id}_${v.suffix}`,
      campaign_id,
      optimization_goal: "OFFSITE_CONVERSIONS",
      billing_event: "IMPRESSIONS",
      daily_budget: newBudgetCents,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      promoted_object: { pixel_id: META_PIXEL_ID, custom_event_type: v.event },
      targeting,
      status: "ACTIVE",
    });
    if (!adsetRes.ok) {
      await admin.from("ig_boost_log").insert({
        post_id, triggered_by, trigger_value, test_variant: v.variant,
        campaign_id, status: "killed",
        kill_reason: `adset_create_failed: ${JSON.stringify(adsetRes.body).slice(0, 400)}`,
        daily_budget_cents: newBudgetCents,
      });
      results.push({ variant: v.variant, ok: false, step: "adset", ...adsetRes });
      return json({ ok: false, post_id, campaign_id, variants: results }, 502);
    }
    const adset_id: string = adsetRes.body.id;

    // Create AdCreative referencing the IG-native post.
    const creativeRes = await metaPost(`${acct}/adcreatives`, {
      name: `IGBoost_${post_id}_${v.suffix}_creative`,
      object_story_spec: {
        page_id: cfg.fb_page_id,
        link_data: { link: "https://rescuedogwines.com/shop" },
      },
      source_instagram_media_id: post_id,
      instagram_user_id: cfg.ig_user_id,
      degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } },
    });
    if (!creativeRes.ok) {
      await admin.from("ig_boost_log").insert({
        post_id, triggered_by, trigger_value, test_variant: v.variant,
        campaign_id, adset_id, status: "killed",
        kill_reason: `creative_create_failed: ${JSON.stringify(creativeRes.body).slice(0, 400)}`,
        daily_budget_cents: newBudgetCents,
      });
      results.push({ variant: v.variant, ok: false, step: "creative", ...creativeRes });
      return json({ ok: false, post_id, campaign_id, variants: results }, 502);
    }
    const creative_id: string = creativeRes.body.id;

    const adRes = await metaPost(`${acct}/ads`, {
      name: `IGBoost_${post_id}_${v.variant}`,
      adset_id,
      creative: { creative_id },
      status: "ACTIVE",
    });
    if (!adRes.ok) {
      await admin.from("ig_boost_log").insert({
        post_id, triggered_by, trigger_value, test_variant: v.variant,
        campaign_id, adset_id, status: "killed",
        kill_reason: `ad_create_failed: ${JSON.stringify(adRes.body).slice(0, 400)}`,
        daily_budget_cents: newBudgetCents,
      });
      results.push({ variant: v.variant, ok: false, step: "ad", ...adRes });
      return json({ ok: false, post_id, campaign_id, variants: results }, 502);
    }
    const ad_id: string = adRes.body.id;

    await admin.from("ig_boost_log").insert({
      post_id, triggered_by, trigger_value, test_variant: v.variant,
      campaign_id, adset_id, ad_id,
      daily_budget_cents: newBudgetCents,
      status: "active",
    });
    results.push({ variant: v.variant, ok: true, campaign_id, adset_id, ad_id });
  }

  return json({ ok: true, post_id, campaign_id, assigned_variant, variants: results });
});