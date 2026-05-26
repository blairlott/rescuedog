import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_ADS_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!;
const DEV_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refreshAccess(refresh_token: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`refresh_failed: ${JSON.stringify(j)}`);
  return j.access_token as string;
}

const GAQL = `
  SELECT
    segments.date,
    campaign.id, campaign.name,
    ad_group.id, ad_group.name,
    ad_group_ad.ad.id,
    metrics.impressions, metrics.clicks, metrics.conversions,
    metrics.cost_micros, metrics.conversions_value
  FROM ad_group_ad
  WHERE segments.date DURING LAST_7_DAYS
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Allow either an authenticated ad-ops user OR the cron secret header.
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronHeader !== CRON_SECRET) {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const user = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user: u } } = await user.auth.getUser();
    if (!u) return json({ error: "unauthorized" }, 401);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: role } = await sb.from("user_roles").select("role")
      .eq("user_id", u.id).in("role", ["owner","admin","ad_ops_manager"]).maybeSingle();
    if (!role) return json({ error: "forbidden" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: accounts, error } = await admin.from("ads_accounts")
    .select("id, customer_id, login_customer_id, refresh_token")
    .eq("status", "active");
  if (error) return json({ error: error.message }, 500);

  const summary: Array<Record<string, unknown>> = [];

  for (const acc of accounts ?? []) {
    try {
      const accessToken = await refreshAccess(acc.refresh_token);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": DEV_TOKEN,
        "Content-Type": "application/json",
      };
      if (acc.login_customer_id) headers["login-customer-id"] = acc.login_customer_id.replace(/-/g, "");

      const r = await fetch(
        `https://googleads.googleapis.com/v17/customers/${acc.customer_id}/googleAds:search`,
        { method: "POST", headers, body: JSON.stringify({ query: GAQL, pageSize: 10000 }) },
      );
      const body = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(body));

      const rows = (body.results || []) as any[];
      const upserts = rows.map((row) => ({
        account_id: acc.id,
        platform: "google_ads",
        date: row.segments?.date,
        campaign_id: String(row.campaign?.id ?? ""),
        campaign_name: row.campaign?.name ?? null,
        ad_group_id: row.adGroup?.id ? String(row.adGroup.id) : null,
        ad_group_name: row.adGroup?.name ?? null,
        ad_id: row.adGroupAd?.ad?.id ? String(row.adGroupAd.ad.id) : null,
        impressions: Number(row.metrics?.impressions ?? 0),
        clicks: Number(row.metrics?.clicks ?? 0),
        conversions: Number(row.metrics?.conversions ?? 0),
        cost_micros: Number(row.metrics?.costMicros ?? 0),
        conversion_value_micros: Math.round(Number(row.metrics?.conversionsValue ?? 0) * 1_000_000),
      })).filter((u) => u.date && u.campaign_id);

      if (upserts.length > 0) {
        const { error: upErr } = await admin.from("ads_performance")
          .upsert(upserts, { onConflict: "account_id,date,campaign_id,ad_group_id,ad_id", ignoreDuplicates: false });
        if (upErr) throw new Error(upErr.message);
      }

      await admin.from("ads_accounts").update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
      }).eq("id", acc.id);

      summary.push({ customer_id: acc.customer_id, rows: upserts.length });
    } catch (e) {
      const msg = String(e).slice(0, 1000);
      await admin.from("ads_accounts").update({
        last_sync_error: msg,
      }).eq("id", acc.id);
      summary.push({ customer_id: acc.customer_id, error: msg });
    }
  }

  // After sync, run the bandit scanner so winners flow into the approval queue.
  await admin.rpc("ads_bandit_scan_opportunities");

  return json({ ok: true, accounts: summary });
});