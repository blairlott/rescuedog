// Yahoo DSP → ad_performance_facts. STUB scaffold.
//
// Status: not live. Requires Yahoo DSP API access (OAuth2 client credentials)
// and an advertiser seat. When secrets are present the function will attempt
// a real pull; otherwise it returns { skipped: "no_yahoo_dsp_credentials" }
// so the cron + UI can be wired today without a working seat.
//
// Secrets expected when live:
//   YAHOO_DSP_CLIENT_ID
//   YAHOO_DSP_CLIENT_SECRET
//   YAHOO_DSP_ADVERTISER_ID
//
// Docs: https://developer.yahooinc.com/dsp/api/reference/  (auth + reports)
// deno-lint-ignore-file no-explicit-any
import { CORS, J, FactRow, isAuthorized, makeAdminClient, writeFacts, ensureChannel } from "../_shared/facts-writer.ts";
import { getCredentials } from "../_shared/credentials.ts";

const TOKEN_URL  = "https://id.b2b.yahooinc.com/identity/oauth2/access_token?realm=dsp";
const REPORT_URL = "https://dspapi.admanagerplus.yahoo.com/traffic/reports";

async function getAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "dsp-api-access",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`yahoo oauth HTTP ${r.status}: ${await r.text()}`);
  const j: any = await r.json();
  return j?.access_token ?? null;
}

// Placeholder report-fetch. Yahoo DSP reports are async (submit → poll → download CSV).
// Implement the submit/poll loop here once the seat is live; for now we just return [].
async function fetchReportRows(_token: string, _days: number): Promise<any[]> {
  return [];
}

function mapRow(channel_id: string, r: any): FactRow {
  return {
    channel_id,
    platform: "yahoo",
    date: r.date,
    campaign_id: r.campaign_id ?? null,
    campaign_name: r.campaign_name ?? null,
    ad_group_id: r.line_id ?? null,
    ad_group_name: r.line_name ?? null,
    ad_id: r.ad_id ?? null,
    ad_name: r.ad_name ?? null,
    geo_country: r.country ?? null,
    geo_region: r.region ?? null,
    geo_dma: r.dma ?? null,
    device: r.device ?? null,
    spend: Number(r.spend ?? 0),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    conversions: Number(r.conversions ?? 0),
    revenue: Number(r.revenue ?? 0),
    source: "yahoo_dsp_api",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = makeAdminClient();
  if (!(await isAuthorized(req, sb))) return J(401, { error: "unauthorized" });

  const creds = await getCredentials(sb, "yahoo_dsp", [
    { key: "client_id",     envFallback: "YAHOO_DSP_CLIENT_ID" },
    { key: "client_secret", envFallback: "YAHOO_DSP_CLIENT_SECRET" },
    { key: "advertiser_id", envFallback: "YAHOO_DSP_ADVERTISER_ID" },
  ]);
  const CLIENT_ID = creds.client_id;
  const CLIENT_SECRET = creds.client_secret;
  const ADVERTISER_ID = creds.advertiser_id;

  if (!CLIENT_ID || !CLIENT_SECRET || !ADVERTISER_ID) {
    return J(200, { ok: true, skipped: "no_yahoo_dsp_credentials" });
  }

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const days = Number(body.days ?? 30);

  const channel_id = await ensureChannel(sb, "yahoo");
  if (!channel_id) return J(500, { error: "no yahoo channel row" });

  try {
    const token = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!token) return J(500, { error: "failed to obtain yahoo dsp access token" });
    const rows = await fetchReportRows(token, days);
    const facts = rows.map((r) => mapRow(channel_id, r));
    const written = await writeFacts(sb, facts);
    return J(200, { ok: true, rows_written: written, rows_fetched: rows.length, stub: rows.length === 0 });
  } catch (e: any) {
    console.error("kennel-ingest-yahoo", e);
    return J(500, { error: String(e?.message ?? e) });
  }
});