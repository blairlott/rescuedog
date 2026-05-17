// Google Ads → ad_performance_facts. Uses GAQL via customer.search.
// deno-lint-ignore-file no-explicit-any
import { CORS, J, FactRow, isAuthorized, makeAdminClient, writeFacts, ensureChannel } from "../_shared/facts-writer.ts";

const VER = "v21";
const CUST = (Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "").replace(/-/g, "");
const LOGIN = (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replace(/-/g, "");
const DEV = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");

async function accessToken(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

async function gaql(query: string, token: string): Promise<any[]> {
  const url = `https://googleads.googleapis.com/${VER}/customers/${CUST}/googleAds:searchStream`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "developer-token": DEV!,
      ...(LOGIN ? { "login-customer-id": LOGIN } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`gaql HTTP ${r.status}: ${JSON.stringify(b)}`);
  // searchStream returns array of chunks { results: [...] }
  const arr: any[] = [];
  if (Array.isArray(b)) for (const chunk of b) for (const row of (chunk.results ?? [])) arr.push(row);
  else for (const row of (b.results ?? [])) arr.push(row);
  return arr;
}

function micros(v: any) { return Number(v ?? 0) / 1_000_000; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = makeAdminClient();
  if (!(await isAuthorized(req, sb))) return J(401, { error: "unauthorized" });
  if (!CUST || !DEV) return J(400, { error: "Google Ads credentials incomplete" });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const days = Number(body.days ?? 30);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const channel_id = await ensureChannel(sb, "google");
  if (!channel_id) return J(500, { error: "no google channel row" });

  const token = await accessToken();
  const errors: string[] = [];
  let total = 0;

  // Pass 1: campaign × device × network × geo region
  try {
    const q = `
      SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name,
             segments.device, segments.ad_network_type, geographic_view.country_criterion_id,
             metrics.cost_micros, metrics.impressions, metrics.clicks,
             metrics.conversions, metrics.conversions_value
      FROM geographic_view
      WHERE segments.date >= '${since}'
    `;
    const rows = await gaql(q, token);
    const facts: FactRow[] = rows.map((row): FactRow => ({
      channel_id, platform: "google",
      date: row.segments?.date,
      campaign_id: String(row.campaign?.id ?? ""), campaign_name: row.campaign?.name,
      ad_group_id: String(row.adGroup?.id ?? ""), ad_group_name: row.adGroup?.name,
      device: row.segments?.device, network: row.segments?.adNetworkType,
      geo_country: row.geographicView?.countryCriterionId ?? null,
      spend: micros(row.metrics?.costMicros),
      impressions: Number(row.metrics?.impressions ?? 0),
      clicks: Number(row.metrics?.clicks ?? 0),
      conversions: Math.round(Number(row.metrics?.conversions ?? 0)),
      revenue: Number(row.metrics?.conversionsValue ?? 0),
      source: "google_ads",
    })).filter(f => f.date);
    total += await writeFacts(sb, facts);
  } catch (e: any) { errors.push(`geo_view: ${e?.message ?? e}`); }

  // Pass 2: ad-level
  try {
    const q = `
      SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name,
             ad_group_ad.ad.id, ad_group_ad.ad.name, segments.device,
             metrics.cost_micros, metrics.impressions, metrics.clicks,
             metrics.conversions, metrics.conversions_value
      FROM ad_group_ad
      WHERE segments.date >= '${since}'
    `;
    const rows = await gaql(q, token);
    const facts: FactRow[] = rows.map((row): FactRow => ({
      channel_id, platform: "google", date: row.segments?.date,
      campaign_id: String(row.campaign?.id ?? ""), campaign_name: row.campaign?.name,
      ad_group_id: String(row.adGroup?.id ?? ""), ad_group_name: row.adGroup?.name,
      ad_id: String(row.adGroupAd?.ad?.id ?? ""), ad_name: row.adGroupAd?.ad?.name,
      device: row.segments?.device,
      spend: micros(row.metrics?.costMicros),
      impressions: Number(row.metrics?.impressions ?? 0),
      clicks: Number(row.metrics?.clicks ?? 0),
      conversions: Math.round(Number(row.metrics?.conversions ?? 0)),
      revenue: Number(row.metrics?.conversionsValue ?? 0),
      source: "google_ads",
    })).filter(f => f.date);
    total += await writeFacts(sb, facts);
  } catch (e: any) { errors.push(`ad_group_ad: ${e?.message ?? e}`); }

  return J(200, { ok: true, rows: total, errors });
});