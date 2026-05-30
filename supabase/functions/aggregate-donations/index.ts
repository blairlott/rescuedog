// aggregate-donations
//
// Computes lifetime giving by querying the QuickBooks ProfitAndLoss
// Reports API directly (date_macro=All, accounting_method=Cash) and
// reading the rolled-up Summary total for the "Charitable Contributions"
// parent account. QB rolls up all sub-accounts natively, which is the
// only way to get the authoritative number — bm_finance_entries flattens
// the hierarchy and under-counts (missing $4k from "Brand Ambassador for
// Charitable Event", parent-vs-rollup gaps on "Donation of Goods" and
// "Donation shipping costs", etc.).
//
// Partner count is read from `rescue_partners` (with optional override).
//
// Triggered by:
//   - pg_cron daily at 13:00 UTC (6am PT)
//   - manual "Run Now" from /crm/admin/donation-metrics
//
// On error: writes error_log + sets source='fallback', preserves the
// prior value_cents / value_display, returns 200 with success=false so
// cron stays healthy. The public counter falls back to seed copy ONLY
// when source='fallback'.

import { createClient } from "npm:@supabase/supabase-js@2";

const CHARITABLE_PARENT = "Charitable Contributions";
const DISCOVERY_URL = "https://developer.api.intuit.com/.well-known/openid_configuration";
let _tokenEndpoint: string | null = null;
async function getTokenEndpoint(): Promise<string> {
  if (_tokenEndpoint) return _tokenEndpoint;
  const r = await fetch(DISCOVERY_URL, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`intuit discovery failed: ${r.status}`);
  const j: any = await r.json();
  _tokenEndpoint = j.token_endpoint;
  return _tokenEndpoint!;
}

async function refreshTokens(admin: any, conn: any): Promise<string> {
  const clientId = Deno.env.get("QBO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET")!;
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
  if (!r.ok) throw new Error(`refresh failed: ${(await r.text()).slice(0, 200)}`);
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

/** Walk the QB ProfitAndLoss report tree and find the rolled-up Summary
 *  total for a parent account by header text (case-insensitive contains).
 *  QB Reports API returns Sections of shape:
 *    { type: "Section", Header: { ColData: [{value: "Charitable Contributions"}, ...] },
 *      Rows: { Row: [ ...sub-account Data rows... ] },
 *      Summary: { ColData: [{value: "Total Charitable Contributions"}, {value: "166109.46"}] } }
 *  The Summary row already includes every sub-account, which is exactly
 *  what we want. */
function findSectionTotal(rows: any[], headerNeedle: string): { total: number; accountId: string | null } | null {
  if (!Array.isArray(rows)) return null;
  const needle = headerNeedle.toLowerCase();
  for (const row of rows) {
    if (row?.type === "Section") {
      const headerText = String(row?.Header?.ColData?.[0]?.value ?? "").trim().toLowerCase();
      const headerId = String(row?.Header?.ColData?.[0]?.id ?? "").trim() || null;
      if (headerText === needle || headerText.includes(needle)) {
        // Last ColData cell of Summary is the rolled-up total (single Total column)
        const cells: any[] = row?.Summary?.ColData ?? [];
        const last = cells[cells.length - 1]?.value;
        const raw = String(last ?? "").replace(/[$,]/g, "").trim();
        const n = Number(raw);
        if (Number.isFinite(n)) return { total: n, accountId: headerId };
      }
      // Recurse into nested sections in case Charitable Contributions sits
      // under a deeper "Expenses" wrapper
      const nested = findSectionTotal(row?.Rows?.Row ?? [], headerNeedle);
      if (nested) return nested;
    }
  }
  return null;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function formatUsd(cents: number): string {
  const dollars = Math.floor(cents / 100);
  return `$${dollars.toLocaleString("en-US")}+`;
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
      .update({ error_log: msg, source: "fallback", as_of: asOf })
      .eq("metric_key", "lifetime_donations");
  };

  try {
    // 1. Partner count from rescue_partners (with optional override).
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

    // 2. Query QB ProfitAndLoss directly. Rolls up sub-accounts natively
    //    — the only way to match the QB Transaction Report total.
    const { data: conn } = await admin
      .from("qbo_connections").select("*").limit(1).maybeSingle();
    if (!conn) throw new Error("no QBO connection — connect via /crm Finance settings");

    let accessToken = conn.access_token;
    if (new Date(conn.access_token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
      accessToken = await refreshTokens(admin, conn);
    }

    const qs = new URLSearchParams({
      date_macro: "All",
      accounting_method: "Cash",
      summarize_column_by: "Total",
      minorversion: "75",
    });
    const url = `https://quickbooks.api.intuit.com/v3/company/${conn.realm_id}/reports/ProfitAndLoss?${qs}`;
    let r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    if (r.status === 401) {
      accessToken = await refreshTokens(admin, conn);
      r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    }
    if (!r.ok) throw new Error(`qbo_api_error ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const report: any = await r.json();

    const found = findSectionTotal(report?.Rows?.Row ?? [], CHARITABLE_PARENT);
    if (!found) throw new Error(`"${CHARITABLE_PARENT}" section not found in QB P&L report`);

    const totalCents = Math.round(found.total * 100);
    if (totalCents <= 0) throw new Error(`"${CHARITABLE_PARENT}" rolled-up total is ${found.total} — refusing to publish`);

    const display = formatUsd(totalCents);

    await admin.from("donation_metrics").upsert(
      {
        metric_key: "lifetime_donations",
        value_cents: totalCents,
        value_display: display,
        partner_count: partnerCount,
        source: "quickbooks",
        qb_account_id: found.accountId,
        qb_account_name: CHARITABLE_PARENT,
        error_log: null,
        as_of: asOf,
        last_successful_at: asOf,
      },
      { onConflict: "metric_key" },
    );

    return respond(200, {
      success: true,
      computed_value_cents: totalCents,
      computed_value_display: display,
      partner_count: partnerCount,
      qb_account: { id: found.accountId, name: CHARITABLE_PARENT },
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
