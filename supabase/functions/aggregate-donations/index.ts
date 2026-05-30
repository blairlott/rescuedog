// aggregate-donations
//
// Computes lifetime giving from the SAME data source the executive
// dashboards already use: `bm_finance_entries`, the P&L ledger populated
// by `qbo-import-pnl`. No parallel QB API path, no env-var account names,
// no out-of-band token handling — just the existing imported QB ledger.
//
// Donation accounts are discovered dynamically by name pattern
// (`Donation%` on expense rows) so the function never goes stale when QB
// account labels evolve. Partner count is read from `rescue_partners`.
//
// Triggered by:
//   - pg_cron daily at 13:00 UTC (6am PT)
//   - manual "Run Now" from /crm/admin/donation-metrics
//
// On error: writes error_log to donation_metrics, preserves the prior
// value_cents / value_display, and returns 200 with success=false (so
// cron stays healthy and the public counter keeps its last-known-good).

import { createClient } from "npm:@supabase/supabase-js@2";

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
      .update({ error_log: msg, as_of: asOf })
      .eq("metric_key", "lifetime_donations");
  };

  try {
    // Pull every QB-imported donation expense row. Same table the exec
    // dashboards read; same `account_name` field surfaced in Finance tiles.
    const { data: rows, error } = await admin
      .from("bm_finance_entries")
      .select("account_name, amount_cents")
      .eq("entry_type", "expense")
      .eq("source", "quickbooks")
      .ilike("account_name", "Donation%");
    if (error) throw error;

    const accountTotals = new Map<string, number>();
    let totalCents = 0;
    for (const r of rows ?? []) {
      const amt = Number(r.amount_cents ?? 0);
      totalCents += amt;
      accountTotals.set(r.account_name, (accountTotals.get(r.account_name) ?? 0) + amt);
    }

    // Partner count — authoritative list from rescue_partners
    const { count: activePartners } = await admin
      .from("rescue_partners")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    const { data: existing } = await admin
      .from("donation_metrics")
      .select("partner_count_override, value_cents, value_display")
      .eq("metric_key", "lifetime_donations")
      .maybeSingle();
    const partnerCount = existing?.partner_count_override ?? activePartners ?? 0;

    // Guard the brand floor: if the ledger says less than the prior
    // value (e.g. data was wiped or partially imported), keep the
    // last-known-good rather than regressing public copy.
    const priorCents = Number(existing?.value_cents ?? 0);
    const useCents = totalCents > 0 && totalCents >= priorCents ? totalCents : (priorCents || totalCents);
    const display = useCents > 0 ? formatUsd(useCents) : (existing?.value_display ?? "$170,000+");

    const accountList = [...accountTotals.keys()].sort();
    const qbAccountName = accountList.length
      ? accountList.join(", ")
      : null;

    await admin.from("donation_metrics").upsert(
      {
        metric_key: "lifetime_donations",
        value_cents: useCents,
        value_display: display,
        partner_count: partnerCount,
        source: "quickbooks",
        qb_account_id: null,
        qb_account_name: qbAccountName,
        error_log: null,
        as_of: asOf,
        last_successful_at: asOf,
      },
      { onConflict: "metric_key" },
    );

    return respond(200, {
      success: true,
      computed_value_cents: useCents,
      computed_value_display: display,
      partner_count: partnerCount,
      qb_account: { id: null, name: qbAccountName },
      accounts: Object.fromEntries(accountTotals),
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
