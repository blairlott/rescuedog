// aggregate-donations
//
// Pulls lifetime giving totals from QuickBooks and upserts the
// `lifetime_donations` row in donation_metrics.
//
// Credential pattern (matches qbo-reports — the exec-dashboard pattern):
//   - QBO_CLIENT_ID / QBO_CLIENT_SECRET from env (shared across QB functions)
//   - refresh_token + realm_id from the latest public.qbo_connections row
//   - Auto-refresh access token via Intuit discovery endpoint, persist rotated
//     refresh_token back into qbo_connections (Intuit rotates these periodically)
//
// Triggered by:
//   - pg_cron daily at 13:00 UTC (6am PT)
//   - manual "Run Now" from /crm/admin/donation-metrics
//
// On error: writes error_log to donation_metrics, preserves last-known-good
// value, and returns 200 with success=false (so cron stays healthy).

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const QB_DONATIONS_ACCOUNT_NAME =
  Deno.env.get("QUICKBOOKS_DONATIONS_ACCOUNT_NAME") ?? "Donations - Rescue Partners";

function formatUsd(cents: number): string {
  const dollars = Math.floor(cents / 100);
  return `$${dollars.toLocaleString("en-US")}+`;
}

const DISCOVERY_URL = "https://developer.api.intuit.com/.well-known/openid_configuration";
let _discoveryCache: { token_endpoint: string } | null = null;
async function getTokenEndpoint() {
  if (_discoveryCache) return _discoveryCache.token_endpoint;
  const r = await fetch(DISCOVERY_URL, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`intuit discovery failed: ${r.status}`);
  const j: any = await r.json();
  _discoveryCache = { token_endpoint: j.token_endpoint };
  return _discoveryCache.token_endpoint;
}

async function refreshTokens(admin: any, conn: any): Promise<string> {
  const clientId = Deno.env.get("QBO_CLIENT_ID");
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("QBO_CLIENT_ID / QBO_CLIENT_SECRET not set");
  const tokenEndpoint = await getTokenEndpoint();
  const r = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  });
  if (!r.ok) {
    const t = await r.text();
    await admin.from("qbo_connections")
      .update({ last_error: `refresh failed: ${t.slice(0, 200)}` })
      .eq("id", conn.id);
    throw new Error(`qbo refresh failed: ${t}`);
  }
  const tok: any = await r.json();
  const accessExpires = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();
  const refreshExpires = new Date(Date.now() + (tok.x_refresh_token_expires_in ?? 8640000) * 1000).toISOString();
  await admin.from("qbo_connections").update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    access_token_expires_at: accessExpires,
    refresh_token_expires_at: refreshExpires,
    last_refreshed_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", conn.id);
  return tok.access_token;
}

interface QbAggregate {
  totalCents: number;
  accountId: string;
  accountName: string;
}

async function fetchQbDonations(admin: any, conn: any): Promise<QbAggregate> {
  let accessToken = conn.access_token;
  if (!accessToken || new Date(conn.access_token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
    accessToken = await refreshTokens(admin, conn);
  }
  const apiBase = "https://quickbooks.api.intuit.com";

  const acctQuery = `SELECT Id, Name FROM Account WHERE Name = '${QB_DONATIONS_ACCOUNT_NAME.replace(/'/g, "\\'")}'`;
  let acctRes = await fetch(
    `${apiBase}/v3/company/${conn.realm_id}/query?query=${encodeURIComponent(acctQuery)}&minorversion=75`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (acctRes.status === 401) {
    accessToken = await refreshTokens(admin, conn);
    acctRes = await fetch(
      `${apiBase}/v3/company/${conn.realm_id}/query?query=${encodeURIComponent(acctQuery)}&minorversion=75`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );
  }
  if (!acctRes.ok) throw new Error(`QB account lookup failed: ${acctRes.status} ${await acctRes.text()}`);
  const acctJson = await acctRes.json();
  const account = acctJson?.QueryResponse?.Account?.[0];
  if (!account) throw new Error(`QB account not found: ${QB_DONATIONS_ACCOUNT_NAME}`);

  const txQuery = `SELECT Id, TotalAmt, EntityRef FROM Purchase WHERE AccountRef = '${account.Id}' MAXRESULTS 1000`;
  const txRes = await fetch(
    `${apiBase}/v3/company/${conn.realm_id}/query?query=${encodeURIComponent(txQuery)}&minorversion=75`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!txRes.ok) throw new Error(`QB tx query failed: ${txRes.status} ${await txRes.text()}`);
  const txJson = await txRes.json();
  const rows: Array<{ TotalAmt?: number; EntityRef?: { value?: string } }> =
    txJson?.QueryResponse?.Purchase ?? [];

  let totalCents = 0;
  for (const r of rows) {
    totalCents += Math.round((r.TotalAmt ?? 0) * 100);
  }

  return {
    totalCents,
    accountId: account.Id,
    accountName: account.Name,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const asOf = new Date().toISOString();
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  const writeErr = async (msg: string) => {
    await admin
      .from("donation_metrics")
      .update({ error_log: msg, as_of: asOf })
      .eq("metric_key", "lifetime_donations");
  };

  const { data: conn } = await admin
    .from("qbo_connections")
    .select("*")
    .order("last_refreshed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!conn) {
    const msg = "No QBO connection found in qbo_connections — connect via /finance first.";
    await writeErr(msg);
    return respond(200, {
      success: false, computed_value_cents: null, computed_value_display: null,
      vendor_count: null, qb_account: null, error: msg, as_of: asOf,
    });
  }

  try {
    const agg = await fetchQbDonations(admin, conn);
    const display = formatUsd(agg.totalCents);

    // partner_count = authoritative count from rescue_partners (is_active=true),
    // matching the public partners list. partner_count_override (if set)
    // takes precedence for temporary inflation during onboarding.
    const { count: activePartners } = await admin
      .from("rescue_partners")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    const { data: existing } = await admin
      .from("donation_metrics")
      .select("partner_count_override")
      .eq("metric_key", "lifetime_donations")
      .maybeSingle();
    const partnerCount = existing?.partner_count_override ?? activePartners ?? 0;

    await admin.from("donation_metrics").upsert(
      {
        metric_key: "lifetime_donations",
        value_cents: agg.totalCents,
        value_display: display,
        partner_count: partnerCount,
        source: "quickbooks",
        qb_account_id: agg.accountId,
        qb_account_name: agg.accountName,
        error_log: null,
        as_of: asOf,
        last_successful_at: asOf,
      },
      { onConflict: "metric_key" },
    );

    return respond(200, {
      success: true,
      computed_value_cents: agg.totalCents,
      computed_value_display: display,
      partner_count: partnerCount,
      qb_account: { id: agg.accountId, name: agg.accountName },
      error: null,
      as_of: asOf,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await writeErr(errMsg);
    return respond(200, {
      success: false, computed_value_cents: null, computed_value_display: null,
      partner_count: null, qb_account: null, error: errMsg, as_of: asOf,
    });
  }
});
