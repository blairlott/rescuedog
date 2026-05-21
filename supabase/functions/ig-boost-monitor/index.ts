// Polls Meta insights for every active boost, applies kill rules,
// and declares winners. Updates ig_boost_log + ig_boost_config.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_TOKEN = Deno.env.get("META_SYSTEM_USER_TOKEN") ?? Deno.env.get("META_ADS_ACCESS_TOKEN")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function pauseAd(ad_id: string) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${ad_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "PAUSED", access_token: META_TOKEN }),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: cfg } = await admin.from("ig_boost_config").select("*").limit(1).maybeSingle();
  if (!cfg) return json({ ok: false, error: "config missing" }, 500);

  const { data: rows, error } = await admin
    .from("ig_boost_log").select("*").eq("status", "active");
  if (error) return json({ ok: false, error: error.message }, 500);

  const results: any[] = [];

  for (const row of rows ?? []) {
    if (!row.ad_id) continue;
    const insUrl = `https://graph.facebook.com/v19.0/${row.ad_id}/insights` +
      `?fields=spend,actions,cost_per_action_type,frequency,action_values,inline_link_clicks,clicks` +
      `&date_preset=lifetime&access_token=${encodeURIComponent(META_TOKEN)}`;
    const res = await fetch(insUrl);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      results.push({ id: row.id, ok: false, status: res.status, body });
      continue;
    }
    const insight = body.data?.[0] ?? {};
    const spend = Number(insight.spend ?? 0);
    const frequency = Number(insight.frequency ?? 0);
    const link_clicks = Number(insight.inline_link_clicks ?? 0);
    const actions: any[] = insight.actions ?? [];
    const actionValues: any[] = insight.action_values ?? [];
    const cpa: any[] = insight.cost_per_action_type ?? [];
    const getAction = (t: string) => Number(actions.find((a) => a.action_type === t)?.value ?? 0);
    const purchases = getAction("purchase") || getAction("offsite_conversion.fb_pixel_purchase");
    const subscribes = getAction("subscribe") || getAction("offsite_conversion.fb_pixel_subscribe");
    const purchaseValue = Number(actionValues.find((a) =>
      a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
    )?.value ?? 0);
    const roas = spend > 0 ? purchaseValue / spend : 0;
    const results_count = row.test_variant === "conversion" ? purchases : subscribes;
    const cost_per_result = Number(
      cpa.find((c) =>
        row.test_variant === "conversion"
          ? (c.action_type === "purchase" || c.action_type === "offsite_conversion.fb_pixel_purchase")
          : (c.action_type === "subscribe" || c.action_type === "offsite_conversion.fb_pixel_subscribe")
      )?.value ?? 0
    );

    // Kill rules
    const killSpendUsd = cfg.kill_spend_threshold_cents / 100;
    const killLinkClickSpendUsd = (cfg.kill_link_clicks_spend_cents ?? 1500) / 100;
    let killReason: string | null = null;
    if (frequency >= cfg.kill_frequency) killReason = "frequency_cap";
    else if (spend >= killLinkClickSpendUsd && link_clicks === 0) killReason = "zero_link_clicks";
    else if (spend >= killSpendUsd && results_count === 0) {
      killReason = row.test_variant === "conversion" ? "zero_purchases" : "zero_subscribes";
    }

    const update: Record<string, unknown> = {
      spend, purchases, subscribes, frequency, roas, cost_per_result,
      last_polled_at: new Date().toISOString(),
    };

    if (killReason) {
      const pauseRes = await pauseAd(row.ad_id);
      update.status = "killed";
      update.kill_reason = killReason;
      update.spend_at_kill = spend;
      update.purchases_at_kill = purchases;
      update.subscribes_at_kill = subscribes;
      results.push({ id: row.id, variant: row.test_variant, killed: killReason, pauseRes });
    }

    // Winner eligibility (only if not killed)
    if (!killReason) {
      const ageDays = (Date.now() - new Date(row.created_at).getTime()) / 86_400_000;
      const winnerMinSpendUsd = cfg.winner_min_spend_cents / 100;
      const eligibleForWinner = ageDays >= cfg.winner_min_age_days || spend >= winnerMinSpendUsd;
      if (eligibleForWinner) {
        const cplUsd = cost_per_result;
        const ltvUsd = cfg.static_ltv_cents / 100;
        const winnerCplUsd = cfg.ab_winner_cpl_cents / 100;
        const isWinner =
          row.test_variant === "conversion"
            ? roas >= Number(cfg.ab_winner_roas_threshold)
            : (cplUsd > 0 && cplUsd < winnerCplUsd && (ltvUsd / cplUsd) > 16);
        if (isWinner) {
          update.status = "winner";
          await admin.from("ig_boost_config")
            .update({ default_objective: row.test_variant })
            .eq("id", cfg.id);
          results.push({ id: row.id, variant: row.test_variant, winner: true });
        }
      }
    }

    await admin.from("ig_boost_log").update(update).eq("id", row.id);
  }

  return json({ ok: true, processed: rows?.length ?? 0, results });
});