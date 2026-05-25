// Nightly check: count Vinoshipper transactions in the last 14 days that have
// not been successfully uploaded to Google OCI. If the backlog exceeds a
// threshold OR contains rows older than 48h, fire a kennel-alert-dispatch
// event so Lindy / ad-ops sees it. Read-only against vs_transactions and
// oci_upload_log; never writes uploads itself.
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkSharedSecret } from "../_shared/cronAlert.ts";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const BACKLOG_COUNT_THRESHOLD = 10;
const BACKLOG_AGE_HOURS = 48;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: cron secret OR ad-ops user.
  const ingestSecret = Deno.env.get("KENNEL_INGEST_SECRET")?.trim();
  const cronAuthorized = await checkSharedSecret(req, {
    functionName: "kennel-oci-backlog-alert",
    envVar: "KENNEL_INGEST_SECRET",
    headers: ["x-kennel-cron-secret", "x-cron-secret"],
    alertOnFail: false,
  });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!cronAuthorized) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: ok } = await userClient.rpc("is_ad_ops", { _user_id: user.id });
    if (!ok) return json({ error: "forbidden" }, 403);
  }

  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  // Pull recent VS orders (eligible for OCI: non-cancelled, total > 0).
  const { data: orders, error: ordErr } = await admin
    .from("vs_transactions")
    .select("invoice, transaction_date, order_total, customer_email, customer_phone")
    .gte("transaction_date", since)
    .neq("chain_status", "Cancelled")
    .gt("order_total", 0)
    .order("transaction_date", { ascending: true })
    .limit(2000);
  if (ordErr) return json({ error: ordErr.message }, 500);

  const eligible = (orders ?? []).filter((o: any) => o.customer_email || o.customer_phone);
  const invoices = eligible.map((o: any) => String(o.invoice));

  let uploaded = new Set<string>();
  if (invoices.length) {
    const { data: ociRows } = await admin
      .from("oci_upload_log")
      .select("order_id")
      .in("order_id", invoices)
      .eq("status", "uploaded");
    uploaded = new Set((ociRows ?? []).map((r: any) => String(r.order_id)).filter(Boolean));
  }

  const pending = eligible.filter((o: any) => !uploaded.has(String(o.invoice)));
  const pendingValueCents = pending.reduce(
    (s: number, o: any) => s + Math.round(Number(o.order_total) * 100),
    0,
  );
  const oldestPending = pending[0]?.transaction_date ?? null;
  const oldestAgeHours = oldestPending
    ? (Date.now() - new Date(oldestPending).getTime()) / 3600000
    : 0;

  const shouldAlert =
    pending.length > BACKLOG_COUNT_THRESHOLD || oldestAgeHours >= BACKLOG_AGE_HOURS;

  let alertResult: any = { skipped: true };
  let autoFlushResult: any = { skipped: true };
  if (shouldAlert) {
    try {
      const r = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/kennel-alert-dispatch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            event_type: "anomaly",
            channel: "google_ads",
            action: "oci_backlog",
            spend_impact_cents: pendingValueCents,
            confidence: 0.95,
            deep_link: `https://rescuedog.lovable.app/kennel/oci-log`,
            message: `${pending.length} conversions ($${(pendingValueCents / 100).toFixed(2)}) pending OCI upload. Oldest: ${oldestAgeHours.toFixed(0)}h. Auto-flush attempted via vinoshipper-conversions-backfill.`,
          }),
        },
      );
      alertResult = { status: r.status, body: await r.json().catch(() => ({})) };
    } catch (e: any) {
      alertResult = { error: String(e?.message ?? e) };
    }

    // Auto-flush: call vinoshipper-conversions-backfill with the cron secret.
    // It will pull the same eligible rows, dedup against oci_upload_log, and
    // upload everything that isn't already marked `uploaded`. Skip Meta here
    // since this loop is OCI-specific.
    try {
      const r2 = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/vinoshipper-conversions-backfill`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-kennel-cron-secret": ingestSecret ?? "",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            since_iso: since,
            limit: 2000,
            send_meta: false,
            send_google: true,
            dry_run: false,
          }),
        },
      );
      autoFlushResult = { status: r2.status, body: await r2.json().catch(() => ({})) };
    } catch (e: any) {
      autoFlushResult = { error: String(e?.message ?? e) };
    }
  }

  return json({
    ok: true,
    pending_count: pending.length,
    pending_value_cents: pendingValueCents,
    oldest_pending_at: oldestPending,
    oldest_age_hours: Number(oldestAgeHours.toFixed(2)),
    thresholds: { count: BACKLOG_COUNT_THRESHOLD, age_hours: BACKLOG_AGE_HOURS },
    alert_fired: shouldAlert,
    alert_result: alertResult,
    auto_flush_result: autoFlushResult,
  });
});