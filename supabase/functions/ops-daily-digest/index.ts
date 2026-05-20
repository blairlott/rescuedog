// Daily AI ops digest — a single morning email to the ops team summarizing
// yesterday's revenue, club movement, ad attribution, and at-risk customers.
//
// Triggered by pg_cron at 13:00 UTC (≈ 8am EST) daily, or manually via POST.
// Recipients are read from `app_settings.ops_digest_recipients` (JSON array
// of emails). Kill switch: `app_settings.ops_digest_enabled` (default true).
//
// Surfaces in `ops_digest_runs` so /crm/intelligence can show recent digests.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const LOVABLE = Deno.env.get("LOVABLE_API_KEY") ?? "";

const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

async function sendEmail(to: string[], subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND || !LOVABLE) return { ok: false, error: "resend not configured" };
  const r = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE}`,
      "X-Connection-Api-Key": RESEND,
    },
    body: JSON.stringify({
      from: "Rescue Dog Wines Ops <ops@rescuedogwines.com>",
      to,
      subject,
      html,
    }),
  });
  if (!r.ok) return { ok: false, error: `resend ${r.status} ${await r.text().catch(() => "")}` };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Kill switch + recipients
  const { data: settings } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", ["ops_digest_enabled", "ops_digest_recipients"]);
  const map = new Map((settings ?? []).map((s: any) => [s.key, s.value]));
  if (String(map.get("ops_digest_enabled") ?? "true") === "false") {
    return J(200, { skipped: true, reason: "ops_digest_enabled=false" });
  }
  let recipients: string[] = [];
  const recRaw = map.get("ops_digest_recipients");
  if (Array.isArray(recRaw)) recipients = recRaw.filter((x: any) => typeof x === "string");
  else if (typeof recRaw === "string") {
    try { recipients = JSON.parse(recRaw); } catch { recipients = recRaw.split(",").map((s) => s.trim()).filter(Boolean); }
  }

  // Date windows
  const now = new Date();
  const yest = new Date(now); yest.setUTCDate(yest.getUTCDate() - 1);
  const yestStr = yest.toISOString().slice(0, 10);
  const last7 = new Date(now); last7.setUTCDate(last7.getUTCDate() - 7);
  const last7Str = last7.toISOString().slice(0, 10);

  // --- Revenue (yesterday + 7d trailing) ---
  const { data: yestTx } = await admin
    .from("vs_transactions").select("order_total, customer_email")
    .eq("transaction_date", yestStr);
  const { data: weekTx } = await admin
    .from("vs_transactions").select("order_total, customer_email, transaction_date")
    .gte("transaction_date", last7Str);

  const yestRevenueCents = Math.round((yestTx ?? []).reduce((s: number, r: any) => s + Number(r.order_total || 0), 0) * 100);
  const yestOrders = (yestTx ?? []).length;
  const yestNewCustomers = new Set((yestTx ?? []).map((r: any) => String(r.customer_email || "").toLowerCase())).size;
  const weekRevenueCents = Math.round((weekTx ?? []).reduce((s: number, r: any) => s + Number(r.order_total || 0), 0) * 100);

  // --- Wine club movement (yesterday) ---
  const { count: joinsYest } = await admin
    .from("wine_club_memberships").select("id", { count: "exact", head: true })
    .gte("joined_at", `${yestStr}T00:00:00Z`).lt("joined_at", `${yestStr}T23:59:59Z`);
  const { count: cancelsYest } = await admin
    .from("wine_club_memberships").select("id", { count: "exact", head: true })
    .gte("cancelled_at", `${yestStr}T00:00:00Z`).lt("cancelled_at", `${yestStr}T23:59:59Z`);
  const { count: activeMembers } = await admin
    .from("wine_club_memberships").select("id", { count: "exact", head: true })
    .eq("status", "active");

  // --- Ad attribution (yesterday) ---
  const { count: capiEventsYest } = await admin
    .from("meta_capi_events").select("id", { count: "exact", head: true })
    .gte("created_at", `${yestStr}T00:00:00Z`).lt("created_at", `${yestStr}T23:59:59Z`);
  const { count: ociEventsYest } = await admin
    .from("oci_upload_log").select("id", { count: "exact", head: true })
    .gte("created_at", `${yestStr}T00:00:00Z`).lt("created_at", `${yestStr}T23:59:59Z`);

  // --- Abandoned carts (open right now) ---
  const { count: openCarts } = await admin
    .from("abandoned_carts").select("id", { count: "exact", head: true })
    .eq("status", "open").catch?.(() => ({ count: 0 } as any)) as any;

  // --- Cohort highlights ---
  const { data: atRisk } = await admin
    .from("customer_cohorts").select("customer_email, lifetime_revenue_cents, days_since_last_order, segment, churn_probability")
    .gte("lifetime_revenue_cents", 20_000)
    .gte("churn_probability", 0.6)
    .order("lifetime_revenue_cents", { ascending: false })
    .limit(10);

  // --- Email body ---
  const atRiskRows = (atRisk ?? []).map((r: any) =>
    `<tr><td style="padding:4px 8px">${esc(r.customer_email)}</td><td style="padding:4px 8px;text-align:right">${dollars(r.lifetime_revenue_cents)}</td><td style="padding:4px 8px;text-align:right">${r.days_since_last_order}d</td><td style="padding:4px 8px;text-align:right">${Math.round((r.churn_probability || 0) * 100)}%</td></tr>`,
  ).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#111">
      <h1 style="color:#c30017;border-bottom:2px solid #c30017;padding-bottom:8px">Daily Ops Digest — ${esc(yestStr)}</h1>

      <h2 style="margin-top:24px">Revenue</h2>
      <ul>
        <li>Yesterday: <strong>${dollars(yestRevenueCents)}</strong> across ${yestOrders} orders (${yestNewCustomers} unique customers)</li>
        <li>Trailing 7 days: <strong>${dollars(weekRevenueCents)}</strong></li>
      </ul>

      <h2>Wine Club</h2>
      <ul>
        <li>Joins yesterday: <strong>${joinsYest ?? 0}</strong></li>
        <li>Cancellations yesterday: <strong>${cancelsYest ?? 0}</strong></li>
        <li>Active members: <strong>${activeMembers ?? 0}</strong></li>
      </ul>

      <h2>Ad Attribution</h2>
      <ul>
        <li>Meta CAPI events sent: <strong>${capiEventsYest ?? 0}</strong></li>
        <li>Google Ads OCI events uploaded: <strong>${ociEventsYest ?? 0}</strong></li>
      </ul>

      <h2>Open Abandoned Carts</h2>
      <p><strong>${openCarts ?? 0}</strong> open carts awaiting recovery.</p>

      <h2>Top At-Risk Customers</h2>
      ${atRiskRows.length ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f5f5f5"><th style="padding:4px 8px;text-align:left">Email</th><th style="padding:4px 8px;text-align:right">LTV</th><th style="padding:4px 8px;text-align:right">Idle</th><th style="padding:4px 8px;text-align:right">Churn</th></tr></thead>
        <tbody>${atRiskRows}</tbody>
      </table>` : "<p>No high-LTV at-risk customers today.</p>"}

      <p style="margin-top:32px;color:#666;font-size:12px">Generated by Rescue Dog Wines autonomy. Reply with "pause digest" to suppress for 7 days.</p>
    </div>`;

  const summary = {
    date: yestStr,
    revenue_cents: yestRevenueCents,
    orders: yestOrders,
    new_customers: yestNewCustomers,
    week_revenue_cents: weekRevenueCents,
    club_joins: joinsYest ?? 0,
    club_cancels: cancelsYest ?? 0,
    active_members: activeMembers ?? 0,
    capi_events: capiEventsYest ?? 0,
    oci_events: ociEventsYest ?? 0,
    open_carts: openCarts ?? 0,
    at_risk_count: (atRisk ?? []).length,
  };

  let emailResult: { ok: boolean; error?: string } = { ok: false, error: "no recipients" };
  if (recipients.length > 0) {
    emailResult = await sendEmail(recipients, `RDW Ops Digest — ${yestStr}`, html);
  }

  // Log run
  await admin.from("ops_digest_runs").insert({
    digest_date: yestStr,
    summary,
    html,
    recipients,
    email_status: emailResult.ok ? "sent" : "failed",
    email_error: emailResult.error ?? null,
  }).then(() => {}, () => {});

  return J(200, { ok: true, summary, email: emailResult });
});