// Monthly tiered seed audience run (Blair-approved spec).
// Calls meta-audience-sync for each tier_* segment, aggregates results,
// and sends an SMS/email summary via kennel-alert-dispatch.
// Triggered by cron on the 1st of each month, or manually.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TIER_KEYS = [
  "tier_top_decile_ltv",
  "tier_top_quartile_ltv",
  "tier_wine_club_members",
  "tier_recent_buyers_90d",
  "tier_all_buyers_24mo",
];

async function callSync(segmentKey: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-audience-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ segment_key: segmentKey }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function dispatchAlert(summary: string, results: any[]) {
  await fetch(`${SUPABASE_URL}/functions/v1/kennel-alert-dispatch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({
      event_type: "recommendation",
      channel: "Meta",
      action: "Monthly tiered seed audience refresh",
      message: summary,
      deep_link: "https://rescuedog.lovable.app/kennel/audiences",
      details: { results },
    }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Auth: service-role (cron) OR ad_ops user
  const auth = req.headers.get("Authorization") ?? "";
  const isServiceRole = auth === `Bearer ${SERVICE_ROLE}`;
  if (!isServiceRole) {
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims } = await userClient.auth.getClaims(auth.slice(7));
    const uid = claims?.claims?.sub as string | undefined;
    if (!uid) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isOps } = await admin.rpc("is_ad_ops", { _user_id: uid });
    if (!isOps) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const startedAt = new Date().toISOString();
  const results: any[] = [];

  for (const key of TIER_KEYS) {
    try {
      const r = await callSync(key);
      const inner = Array.isArray(r.body?.results) ? r.body.results[0] : null;
      results.push({
        segment_key: key,
        status: r.status,
        ok: !!inner?.ok,
        pushed: inner?.pushed ?? 0,
        matched: inner?.matched ?? 0,
        error: inner?.error ?? r.body?.error ?? null,
      });
    } catch (e: any) {
      results.push({
        segment_key: key,
        status: 0,
        ok: false,
        pushed: 0,
        matched: 0,
        error: e?.message ?? String(e),
      });
    }
  }

  const totalMatched = results.reduce((a, r) => a + (r.matched ?? 0), 0);
  const totalPushed = results.reduce((a, r) => a + (r.pushed ?? 0), 0);
  const failures = results.filter((r) => !r.ok);

  const lines = results.map((r) => {
    const short = r.segment_key.replace("tier_", "").replace(/_/g, " ");
    return r.ok
      ? `✓ ${short}: ${r.matched.toLocaleString()} matched / ${r.pushed.toLocaleString()} pushed`
      : `✗ ${short}: ${r.error ?? "failed"}`;
  });

  const summary =
    `Tiered seed refresh complete.\n` +
    `Totals: ${totalMatched.toLocaleString()} matched · ${totalPushed.toLocaleString()} pushed across ${TIER_KEYS.length} tiers.\n` +
    (failures.length ? `${failures.length} failed.\n\n` : `All tiers OK.\n\n`) +
    lines.join("\n");

  await dispatchAlert(summary, results);

  return new Response(
    JSON.stringify({
      ok: failures.length === 0,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      total_matched: totalMatched,
      total_pushed: totalPushed,
      failures: failures.length,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});