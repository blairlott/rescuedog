// Google Ads keyword + search-term ingest → ad_keywords / ad_search_terms.
// Pulls keyword_view (30d perf, status, bid, QS) and search_term_view (raw queries).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kennel-ingest-secret",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const VER = "v21";
const CUST = (Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "").replace(/-/g, "");
const LOGIN = (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replace(/-/g, "");
const DEV = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");

async function token(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("GOOGLE_ADS_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN")!,
    }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`google token HTTP ${r.status}: ${JSON.stringify(b)}`);
  return b.access_token as string;
}

async function gaql(query: string, tok: string): Promise<any[]> {
  const url = `https://googleads.googleapis.com/${VER}/customers/${CUST}/googleAds:searchStream`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok}`,
      "developer-token": DEV!,
      ...(LOGIN ? { "login-customer-id": LOGIN } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`gaql HTTP ${r.status}: ${JSON.stringify(b)}`);
  const arr: any[] = [];
  if (Array.isArray(b)) for (const chunk of b) for (const row of (chunk.results ?? [])) arr.push(row);
  else for (const row of (b.results ?? [])) arr.push(row);
  return arr;
}

const micros = (v: any) => Math.round(Number(v ?? 0) / 10_000); // micros → cents

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: ingest secret, service-role JWT, or ad_ops user.
  const secret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  const headerSecret = req.headers.get("x-kennel-ingest-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const isService = auth === `Bearer ${SERVICE_KEY}`;
  const hasSecret = secret && headerSecret === secret;
  let isAdOps = false;
  if (!isService && !hasSecret && auth.startsWith("Bearer ")) {
    const tokenStr = auth.slice(7);
    const { data: userRes } = await sb.auth.getUser(tokenStr);
    const uid = userRes?.user?.id;
    if (uid) {
      const { data: ok } = await sb.rpc("is_ad_ops", { _user_id: uid });
      isAdOps = !!ok;
    }
  }
  if (!isService && !hasSecret && !isAdOps) return J(401, { error: "unauthorized" });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (body?.dry_run === true || body?.probe === true) {
    return J(200, { ok: true, dry_run: true, function: "kennel-ingest-google-keywords" });
  }
  if (!CUST || !DEV) return J(400, { error: "Google Ads credentials incomplete" });

  const days = Math.min(Math.max(Number(body?.days ?? 30), 1), 90);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);

  const tok = await token();
  const errors: string[] = [];
  let keywordsUpserted = 0;
  let searchTermsInserted = 0;

  // Pass 1: keywords
  try {
    const q = `
      SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
             ad_group_criterion.keyword.match_type, ad_group_criterion.status,
             ad_group_criterion.quality_info.quality_score,
             ad_group_criterion.effective_cpc_bid_micros,
             campaign.id, campaign.name, ad_group.id, ad_group.name,
             metrics.cost_micros, metrics.impressions, metrics.clicks,
             metrics.conversions, metrics.conversions_value
      FROM keyword_view
      WHERE segments.date BETWEEN '${since}' AND '${until}'
        AND ad_group_criterion.status != 'REMOVED'
    `;
    const rows = await gaql(q, tok);
    // Aggregate by criterion (rows are not segmented by date here, but API may return per-day; sum just in case)
    const agg = new Map<string, any>();
    for (const r of rows) {
      const critId = String(r.adGroupCriterion?.criterionId ?? "");
      const adGroupId = String(r.adGroup?.id ?? "");
      const extId = `${adGroupId}::${critId}`;
      if (!extId || !r.adGroupCriterion?.keyword?.text) continue;
      const cur = agg.get(extId) ?? {
        platform_slug: "google",
        external_id: extId,
        keyword: r.adGroupCriterion.keyword.text,
        match_type: String(r.adGroupCriterion.keyword.matchType ?? "BROAD").toLowerCase(),
        status: String(r.adGroupCriterion.status ?? "enabled").toLowerCase(),
        bid_cents: micros(r.adGroupCriterion.effectiveCpcBidMicros),
        quality_score: r.adGroupCriterion.qualityInfo?.qualityScore ?? null,
        impressions_30d: 0,
        clicks_30d: 0,
        spend_30d_cents: 0,
        conversions_30d: 0,
        sales_30d_cents: 0,
        metadata: {
          campaign_id: String(r.campaign?.id ?? ""),
          campaign_name: r.campaign?.name ?? null,
          ad_group_id: adGroupId,
          ad_group_name: r.adGroup?.name ?? null,
        },
        last_synced_at: new Date().toISOString(),
      };
      cur.impressions_30d += Number(r.metrics?.impressions ?? 0);
      cur.clicks_30d += Number(r.metrics?.clicks ?? 0);
      cur.spend_30d_cents += micros(r.metrics?.costMicros);
      cur.conversions_30d += Math.round(Number(r.metrics?.conversions ?? 0));
      cur.sales_30d_cents += Math.round(Number(r.metrics?.conversionsValue ?? 0) * 100);
      agg.set(extId, cur);
    }
    const payload = Array.from(agg.values());
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error } = await sb.from("ad_keywords")
        .upsert(chunk, { onConflict: "platform_slug,external_id" });
      if (error) throw new Error(`keyword upsert: ${error.message}`);
      keywordsUpserted += chunk.length;
    }
  } catch (e: any) {
    errors.push(`keywords: ${e?.message ?? e}`);
  }

  // Pass 2: search terms (last 30d, unresolved only — append, don't dedupe aggressively)
  try {
    const q = `
      SELECT search_term_view.search_term, search_term_view.status,
             campaign.id, campaign.name, ad_group.id, ad_group.name,
             metrics.cost_micros, metrics.impressions, metrics.clicks,
             metrics.conversions, metrics.conversions_value
      FROM search_term_view
      WHERE segments.date BETWEEN '${since}' AND '${until}'
    `;
    const rows = await gaql(q, tok);
    const agg = new Map<string, any>();
    for (const r of rows) {
      const query = r.searchTermView?.searchTerm;
      if (!query) continue;
      const key = `${String(r.campaign?.id ?? "")}::${query}`;
      const cur = agg.get(key) ?? {
        platform_slug: "google",
        query,
        impressions: 0,
        clicks: 0,
        spend_cents: 0,
        conversions: 0,
        sales_cents: 0,
        metadata: {
          campaign_id: String(r.campaign?.id ?? ""),
          campaign_name: r.campaign?.name ?? null,
          ad_group_id: String(r.adGroup?.id ?? ""),
          ad_group_name: r.adGroup?.name ?? null,
          status: r.searchTermView?.status ?? null,
          window_days: days,
        },
      };
      cur.impressions += Number(r.metrics?.impressions ?? 0);
      cur.clicks += Number(r.metrics?.clicks ?? 0);
      cur.spend_cents += micros(r.metrics?.costMicros);
      cur.conversions += Math.round(Number(r.metrics?.conversions ?? 0));
      cur.sales_cents += Math.round(Number(r.metrics?.conversionsValue ?? 0) * 100);
      agg.set(key, cur);
    }
    // Replace recent unresolved Google search terms to avoid runaway growth.
    await sb.from("ad_search_terms")
      .delete()
      .eq("platform_slug", "google")
      .is("resolved_at", null);
    const payload = Array.from(agg.values());
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error } = await sb.from("ad_search_terms").insert(chunk);
      if (error) throw new Error(`search_term insert: ${error.message}`);
      searchTermsInserted += chunk.length;
    }
  } catch (e: any) {
    errors.push(`search_terms: ${e?.message ?? e}`);
  }

  return J(errors.length ? 207 : 200, {
    ok: errors.length === 0,
    function: "kennel-ingest-google-keywords",
    days,
    keywords_upserted: keywordsUpserted,
    search_terms_inserted: searchTermsInserted,
    errors,
  });
});