// Phase 4 #21 — Auto-create Meta Lookalike audiences from qualifying seeds.
// Runs nightly via cron. For each meta_audiences row where:
//   enabled = true AND create_lal = true AND meta_audience_id IS NOT NULL
//   AND meta_lookalike_id IS NULL AND member_count >= min_seed_size
// it creates a 1% LAL via Graph API and stores the resulting id.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};
const GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Kill switch + min seed
  const { data: settings } = await admin
    .from("app_settings")
    .select("key,value")
    .in("key", ["lookalike_autocreate_enabled", "lookalike_min_seed_size"]);
  const map = Object.fromEntries((settings ?? []).map((r: any) => [r.key, r.value]));
  if (map.lookalike_autocreate_enabled === false) {
    return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const minSeed = Number(map.lookalike_min_seed_size ?? 100);

  const token = Deno.env.get("META_SYSTEM_USER_TOKEN");
  const accountId = Deno.env.get("META_ADS_ACCOUNT_ID");
  if (!token || !accountId) {
    return new Response(JSON.stringify({ ok: false, error: "missing META token/account" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: candidates, error } = await admin
    .from("meta_audiences")
    .select("*")
    .eq("enabled", true)
    .eq("create_lal", true)
    .not("meta_audience_id", "is", null)
    .is("meta_lookalike_id", null);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const seg of candidates ?? []) {
    if ((seg.member_count ?? 0) < minSeed) {
      results.push({ segment_key: seg.segment_key, skipped: "below_min_seed", member_count: seg.member_count });
      continue;
    }
    const ratio = Number(seg.lal_ratio ?? 0.01);
    const lalName = `${seg.segment_name} — LAL ${Math.round(ratio * 100)}% US`;
    const url = new URL(`${GRAPH}/act_${accountId}/customaudiences`);
    url.searchParams.set("access_token", token);
    const body = {
      name: lalName,
      subtype: "LOOKALIKE",
      origin_audience_id: seg.meta_audience_id,
      lookalike_spec: JSON.stringify({ ratio, country: "US", type: "similarity" }),
    };
    try {
      const r = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.id) {
        results.push({ segment_key: seg.segment_key, error: j.error?.message ?? `HTTP ${r.status}` });
        continue;
      }
      await admin
        .from("meta_audiences")
        .update({
          meta_lookalike_id: j.id,
          notes: `${seg.notes ?? ""}\nLAL auto-created ${new Date().toISOString()}`.trim(),
        })
        .eq("id", seg.id);
      results.push({ segment_key: seg.segment_key, lookalike_id: j.id, name: lalName });
    } catch (e: any) {
      results.push({ segment_key: seg.segment_key, error: e.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});