// Reads latest winback_snapshots and drops pending ad_recommendations rows
// (kind=audience_update) when a tier crosses the size threshold AND hasn't
// been recommended/launched in the cooldown window. Idempotent per day per
// tier+channel via ingest_request_id.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TIERS = ["tier_60", "tier_120", "tier_240", "tier_365"] as const;
const CHANNELS = ["mailchimp", "meta", "google"] as const;

const THRESHOLD = 250;
const COOLDOWN_DAYS = 14;

const TIER_LABEL: Record<string, string> = {
  tier_60: "60-120 day", tier_120: "120-240 day", tier_240: "240-365 day", tier_365: "365+ day",
};
const CHANNEL_LABEL: Record<string, string> = {
  mailchimp: "Mailchimp journey", meta: "Meta retargeting", google: "Google Customer Match",
};
const CHANNEL_NAME: Record<string, string> = {
  mailchimp: null as any, meta: "Meta Ads", google: "Google Ads",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  const headerSecret = req.headers.get("x-kennel-ingest-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const isService = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  const hasSecret = !!secret && headerSecret === secret;

  let isAuthorizedUser = false;
  if (!isService && !hasSecret && auth.startsWith("Bearer ")) {
    try {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const token = auth.replace("Bearer ", "");
      const { data } = await userClient.auth.getClaims(token);
      const uid = data?.claims?.sub;
      if (uid) {
        const { data: ok } = await userClient.rpc("is_ad_ops", { _user_id: uid });
        isAuthorizedUser = !!ok;
      }
    } catch (_) {
      isAuthorizedUser = false;
    }
  }

  if (!isService && !hasSecret && !isAuthorizedUser) {
    return J(401, { error: "unauthorized" });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Map channel name → ad_channels.id
  const { data: channels } = await admin.from("ad_channels").select("id, name");
  const chanIdByName = new Map<string, string>();
  for (const c of (channels ?? []) as any[]) chanIdByName.set(c.name, c.id);

  const created: any[] = [];
  const skipped: any[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const channel of CHANNELS) {
    for (const tier of TIERS) {
      // Latest snapshot for this tier+channel
      const { data: latest } = await admin
        .from("winback_snapshots")
        .select("member_count, snapshot_date, payload")
        .eq("channel", channel).eq("tier", tier)
        .order("snapshot_date", { ascending: false }).limit(1).maybeSingle();
      const count = latest?.member_count ?? 0;
      if (count < THRESHOLD) {
        skipped.push({ channel, tier, count, reason: "below_threshold" });
        continue;
      }

      // Cooldown check
      const { data: state } = await admin
        .from("winback_campaign_state")
        .select("last_recommended_at, last_launched_at")
        .eq("channel", channel).eq("tier", tier).maybeSingle();
      const ref = state?.last_launched_at ?? state?.last_recommended_at;
      if (ref && Date.now() - new Date(ref).getTime() < COOLDOWN_DAYS * 86400_000) {
        skipped.push({ channel, tier, count, reason: "in_cooldown" });
        continue;
      }

      // Idempotency: one rec per channel+tier+day
      const ingestId = `winback:${channel}:${tier}:${today}`;
      const { data: existing } = await admin
        .from("ad_recommendations").select("id").eq("ingest_request_id", ingestId).maybeSingle();
      if (existing?.id) { skipped.push({ channel, tier, count, reason: "already_created" }); continue; }

      const channelName = CHANNEL_NAME[channel];
      const channelId = channelName ? chanIdByName.get(channelName) ?? null : null;

      const title = `Spin up ${TIER_LABEL[tier]} winback — ${CHANNEL_LABEL[channel]}`;
      const summary = `${count.toLocaleString()} customers in the ${TIER_LABEL[tier]} window are synced to ${CHANNEL_LABEL[channel]}. Cooldown is ${COOLDOWN_DAYS}d; this tier hasn't been activated in that period.`;
      const rationale = `Threshold: ≥${THRESHOLD} members. Current: ${count}. Audience is fresh as of ${latest?.snapshot_date}. Approving this will launch the saved winback creative for this tier; rollback restores the previous campaign state.`;

      const payload = {
        kind: "winback_campaign_launch",
        tier, channel,
        member_count: count,
        snapshot_date: latest?.snapshot_date,
        audience_ref: latest?.payload ?? {},
      };

      const projected = Math.round(count * 18 * 100); // rough $18 LTV reactivation est, cents
      const { data: rec, error: recErr } = await admin
        .from("ad_recommendations")
        .insert({
          channel_id: channelId,
          kind: "audience_update",
          title, summary, rationale,
          projected_impact_cents: projected,
          confidence: 0.55,
          source: "native",
          status: "pending",
          expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
          ingest_request_id: ingestId,
          payload,
        })
        .select("id").maybeSingle();
      if (recErr) { skipped.push({ channel, tier, count, reason: recErr.message }); continue; }

      await admin.from("winback_campaign_state").upsert({
        channel, tier,
        last_recommended_at: new Date().toISOString(),
        last_member_count: count,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tier,channel" });

      created.push({ channel, tier, count, rec_id: rec?.id });
    }
  }

  return J(200, { ok: true, created, skipped, threshold: THRESHOLD, cooldown_days: COOLDOWN_DAYS });
});