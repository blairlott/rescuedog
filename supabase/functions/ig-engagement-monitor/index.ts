// Polls Instagram organic post insights and triggers ig-auto-boost
// for posts that exceed save_rate / engagement_rate thresholds.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: cfg, error: cfgErr } = await admin
    .from("ig_boost_config").select("*").limit(1).maybeSingle();
  if (cfgErr || !cfg) return json({ ok: false, error: "config missing", cfgErr }, 500);

  // Pull recent IG posts + insights
  const igUrl = `https://graph.facebook.com/v21.0/${cfg.ig_user_id}/media` +
    `?fields=id,media_type,permalink,caption,timestamp,` +
    `like_count,comments_count,` +
    `insights.metric(reach,saved,shares,views,total_interactions)` +
    `&limit=25&access_token=${encodeURIComponent(META_TOKEN)}`;
  const igRes = await fetch(igUrl);
  const igJson = await igRes.json().catch(() => ({}));
  if (!igRes.ok) return json({ ok: false, step: "ig_media", status: igRes.status, body: igJson }, 502);

  const posts: any[] = igJson.data ?? [];
  const qualifying: any[] = [];

  // Count currently active boosts (each post creates 2 rows; count distinct posts)
  const { data: activeRows } = await admin
    .from("ig_boost_log").select("post_id").eq("status", "active");
  const activePostIds = new Set((activeRows ?? []).map((r: any) => r.post_id));
  let activeSlots = cfg.max_active_boosts - activePostIds.size;

  const examined: any[] = [];

  for (const p of posts) {
    const insights: any[] = p.insights?.data ?? [];
    const getMetric = (name: string) =>
      Number(insights.find((i) => i.name === name)?.values?.[0]?.value ?? 0);
    const impressions = getMetric("impressions");
    const reach = getMetric("reach");
    const likes = getMetric("likes");
    const comments = getMetric("comments");
    const shares = getMetric("shares");
    const saves = getMetric("saved");
    const save_rate = reach > 0 ? saves / reach : 0;
    const engagement_rate = reach > 0 ? (likes + comments + shares + saves) / reach : 0;

    await admin.from("ig_post_metrics").insert({
      post_id: p.id,
      media_type: p.media_type,
      permalink: p.permalink,
      caption: p.caption,
      post_timestamp: p.timestamp,
      impressions, reach, likes, comments, shares, saves,
      engagement_rate, save_rate,
    });

    const ageHours = (Date.now() - new Date(p.timestamp).getTime()) / 3_600_000;
    const meetsRate = save_rate >= cfg.save_rate_threshold || engagement_rate >= cfg.engagement_rate_threshold;
    const meetsReach = reach >= cfg.min_reach;
    const meetsAge = ageHours >= cfg.min_post_age_hours;

    examined.push({
      post_id: p.id, reach, save_rate, engagement_rate, ageHours,
      meetsRate, meetsReach, meetsAge,
    });

    if (!meetsRate || !meetsReach || !meetsAge) continue;

    // Skip if already boosted (ever)
    const { data: existing } = await admin
      .from("ig_boost_log").select("id").eq("post_id", p.id).limit(1);
    if (existing && existing.length > 0) continue;
    if (activeSlots <= 0) break;
    activeSlots--;

    qualifying.push({
      post_id: p.id,
      trigger_value: Math.max(save_rate, engagement_rate),
      triggered_by: save_rate >= cfg.save_rate_threshold ? "save_rate" : "engagement_rate",
    });
  }

  // Invoke ig-auto-boost for each
  const dispatched: any[] = [];
  for (const q of qualifying) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ig-auto-boost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify(q),
    });
    dispatched.push({ post_id: q.post_id, status: res.status, body: await res.text() });
  }

  return json({
    ok: true,
    examined_count: posts.length,
    qualifying_count: qualifying.length,
    examined,
    dispatched,
  });
});