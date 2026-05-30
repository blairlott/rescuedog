import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * aggregate-donations
 *
 * Pulls lifetime giving totals from QuickBooks and upserts donation_metrics.
 * If QB credentials are not configured, returns an error and preserves the
 * last-known-good row (never overwrites a real value with a stub).
 *
 * Triggered by:
 *  - pg_cron daily at 6am PT
 *  - manual "Run Now" button from /admin/donation-metrics
 *
 * Response shape (consumed by AdminDonationMetricsPage):
 *  {
 *    success: boolean,
 *    computed_value_cents: number | null,
 *    computed_value_display: string | null,
 *    vendor_count: number | null,
 *    qb_account: { id: string, name: string } | null,
 *    error: string | null,
 *    as_of: string
 *  }
 */

const QB_CLIENT_ID = Deno.env.get("QUICKBOOKS_CLIENT_ID");
const QB_CLIENT_SECRET = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");
const QB_REFRESH_TOKEN = Deno.env.get("QUICKBOOKS_REFRESH_TOKEN");
const QB_REALM_ID = Deno.env.get("QUICKBOOKS_REALM_ID");
const QB_DONATIONS_ACCOUNT_NAME =
  Deno.env.get("QUICKBOOKS_DONATIONS_ACCOUNT_NAME") ?? "Donations - Rescue Partners";
const QB_ENV = Deno.env.get("QUICKBOOKS_ENV") ?? "production"; // 'sandbox' | 'production'

function formatUsd(cents: number): string {
  const dollars = Math.floor(cents / 100);
  return `$${dollars.toLocaleString("en-US")}+`;
}

async function refreshQbToken(): Promise<string> {
  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  const basic = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(QB_REFRESH_TOKEN!)}`,
  });
  if (!res.ok) throw new Error(`QB token refresh failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

interface QbAggregate {
  totalCents: number;
  vendorCount: number;
  accountId: string;
  accountName: string;
}

async function fetchQbDonations(): Promise<QbAggregate> {
  const accessToken = await refreshQbToken();
  const apiBase =
    QB_ENV === "sandbox"
      ? "https://sandbox-quickbooks.api.intuit.com"
      : "https://quickbooks.api.intuit.com";

  // Resolve donations account id by name
  const acctQuery = `SELECT Id, Name FROM Account WHERE Name = '${QB_DONATIONS_ACCOUNT_NAME.replace(/'/g, "\\'")}'`;
  const acctRes = await fetch(
    `${apiBase}/v3/company/${QB_REALM_ID}/query?query=${encodeURIComponent(acctQuery)}&minorversion=70`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!acctRes.ok) throw new Error(`QB account lookup failed: ${acctRes.status} ${await acctRes.text()}`);
  const acctJson = await acctRes.json();
  const account = acctJson?.QueryResponse?.Account?.[0];
  if (!account) throw new Error(`QB account not found: ${QB_DONATIONS_ACCOUNT_NAME}`);

  // Sum all purchases against the donations account, group vendors
  const txQuery = `SELECT Id, TotalAmt, EntityRef FROM Purchase WHERE AccountRef = '${account.Id}' MAXRESULTS 1000`;
  const txRes = await fetch(
    `${apiBase}/v3/company/${QB_REALM_ID}/query?query=${encodeURIComponent(txQuery)}&minorversion=70`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!txRes.ok) throw new Error(`QB tx query failed: ${txRes.status} ${await txRes.text()}`);
  const txJson = await txRes.json();
  const rows: Array<{ TotalAmt?: number; EntityRef?: { value?: string } }> =
    txJson?.QueryResponse?.Purchase ?? [];

  let totalCents = 0;
  const vendors = new Set<string>();
  for (const r of rows) {
    totalCents += Math.round((r.TotalAmt ?? 0) * 100);
    const v = r.EntityRef?.value;
    if (v) vendors.add(v);
  }

  return {
    totalCents,
    vendorCount: vendors.size,
    accountId: account.Id,
    accountName: account.Name,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const asOf = new Date().toISOString();
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // No credentials → record error_log, preserve last-known-good row, return 200
  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET || !QB_REFRESH_TOKEN || !QB_REALM_ID) {
    const errMsg =
      "QuickBooks credentials not configured (missing one of: QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REFRESH_TOKEN, QUICKBOOKS_REALM_ID). Last-known-good donation_metrics row retained.";
    await supabase
      .from("donation_metrics")
      .update({ error_log: errMsg, as_of: asOf })
      .eq("metric_key", "lifetime_donations");
    return respond(200, {
      success: false,
      computed_value_cents: null,
      computed_value_display: null,
      vendor_count: null,
      qb_account: null,
      error: errMsg,
      as_of: asOf,
    });
  }

  try {
    const agg = await fetchQbDonations();
    const display = formatUsd(agg.totalCents);

    await supabase.from("donation_metrics").upsert(
      {
        metric_key: "lifetime_donations",
        value_cents: agg.totalCents,
        value_display: display,
        partner_count: agg.vendorCount,
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
      vendor_count: agg.vendorCount,
      qb_account: { id: agg.accountId, name: agg.accountName },
      error: null,
      as_of: asOf,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("donation_metrics")
      .update({ error_log: errMsg, as_of: asOf })
      .eq("metric_key", "lifetime_donations");
    return respond(200, {
      success: false,
      computed_value_cents: null,
      computed_value_display: null,
      vendor_count: null,
      qb_account: null,
      error: errMsg,
      as_of: asOf,
    });
  }
});