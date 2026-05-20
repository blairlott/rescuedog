// Nightly cohort rebuilder.
//
// Reads `vs_transactions` (canonical order ledger) + `wine_club_memberships`
// and writes one row per unique customer (keyed by email) into
// `customer_cohorts`. Powers the CRM Intelligence dashboards (churn, LTV,
// cohorts) and the daily ops digest.
//
// Auth: service role only. Triggered by pg_cron at 04:15 UTC daily, or
// manually via POST from /crm/intelligence "Rebuild now" button (admin only).
//
// Heuristic:
//   churn_probability   — banded on days-since-last-order, club members get -0.15.
//   segment             — champion / loyal / regular / one_time / at_risk / lost.
//   predicted_ltv_cents — avg_order × forecast orders over next 24 months, weighted by retention.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Aggregate {
  email: string;
  first_order_at: string;
  last_order_at: string;
  orders_count: number;
  lifetime_revenue_cents: number;
  state: string | null;
}

function bandChurn(daysSinceLast: number, isClub: boolean, ordersCount: number): number {
  let base: number;
  if (daysSinceLast <= 30) base = 0.05;
  else if (daysSinceLast <= 90) base = 0.20;
  else if (daysSinceLast <= 180) base = 0.45;
  else if (daysSinceLast <= 365) base = 0.70;
  else base = 0.90;
  // Club members are stickier
  if (isClub) base = Math.max(0.02, base - 0.15);
  // One-time buyers are riskier
  if (ordersCount === 1 && daysSinceLast > 60) base = Math.min(0.95, base + 0.1);
  return Math.round(base * 1000) / 1000;
}

function pickSegment(ltvCents: number, daysSinceLast: number, ordersCount: number, isClub: boolean): string {
  if (isClub) return "club_member";
  if (daysSinceLast > 365) return "lost";
  if (daysSinceLast > 180) return "at_risk";
  if (ltvCents >= 50_000) return "champion";
  if (ltvCents >= 20_000) return "loyal";
  if (ordersCount === 1) return "one_time";
  return "regular";
}

function predictLtvCents(avgOrderCents: number, ordersCount: number, daysActive: number, isClub: boolean): number {
  // Annual order frequency
  const yrs = Math.max(daysActive / 365, 0.25);
  const annualOrders = ordersCount / yrs;
  // Forecast 24 months with retention multiplier (club = 0.85, else = 0.55)
  const retention = isClub ? 0.85 : 0.55;
  const forecastOrders = annualOrders * 2 * retention;
  return Math.round(avgOrderCents * forecastOrders);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Pull all VS transactions (paged — table grows past 1k row limit).
  const aggregates = new Map<string, Aggregate>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await admin
      .from("vs_transactions")
      .select("customer_email, transaction_date, order_total, ship_to_state, customer_state")
      .not("customer_email", "is", null)
      .range(from, from + PAGE - 1);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    if (!data || data.length === 0) break;
    for (const row of data) {
      const email = String(row.customer_email).trim().toLowerCase();
      if (!email || !email.includes("@")) continue;
      const date = row.transaction_date ? String(row.transaction_date) : null;
      const total = Math.round(Number(row.order_total || 0) * 100);
      const state = (row.ship_to_state || row.customer_state || null) as string | null;
      const existing = aggregates.get(email);
      if (!existing) {
        if (!date) continue;
        aggregates.set(email, {
          email,
          first_order_at: date,
          last_order_at: date,
          orders_count: 1,
          lifetime_revenue_cents: total,
          state,
        });
      } else {
        existing.orders_count += 1;
        existing.lifetime_revenue_cents += total;
        if (date && date < existing.first_order_at) existing.first_order_at = date;
        if (date && date > existing.last_order_at) existing.last_order_at = date;
        if (!existing.state && state) existing.state = state;
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // 2) Pull club member emails so we can flag them.
  const { data: clubRows } = await admin
    .from("wine_club_memberships")
    .select("user_id, status")
    .eq("status", "active");
  const clubUserIds = new Set((clubRows ?? []).map((r: any) => r.user_id));
  let clubEmails = new Set<string>();
  if (clubUserIds.size > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", Array.from(clubUserIds));
    clubEmails = new Set((profileRows ?? []).map((p: any) => String(p.email || "").toLowerCase()).filter(Boolean));
  }

  // 3) Build cohort rows.
  const now = new Date();
  const upserts = Array.from(aggregates.values()).map((a) => {
    const last = new Date(a.last_order_at);
    const first = new Date(a.first_order_at);
    const daysSinceLast = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000));
    const daysActive = Math.max(1, Math.floor((last.getTime() - first.getTime()) / 86_400_000));
    const avgOrderCents = Math.round(a.lifetime_revenue_cents / a.orders_count);
    const isClub = clubEmails.has(a.email);
    const churn = bandChurn(daysSinceLast, isClub, a.orders_count);
    const segment = pickSegment(a.lifetime_revenue_cents, daysSinceLast, a.orders_count, isClub);
    const predicted = predictLtvCents(avgOrderCents, a.orders_count, daysActive, isClub);
    const acqMonth = `${a.first_order_at.slice(0, 7)}-01`;
    return {
      customer_email: a.email,
      acquisition_month: acqMonth,
      first_order_at: a.first_order_at,
      last_order_at: a.last_order_at,
      orders_count: a.orders_count,
      lifetime_revenue_cents: a.lifetime_revenue_cents,
      avg_order_value_cents: avgOrderCents,
      days_since_last_order: daysSinceLast,
      is_club_member: isClub,
      segment,
      churn_probability: churn,
      predicted_ltv_cents: predicted,
      state: a.state,
      computed_at: new Date().toISOString(),
    };
  });

  // 4) Upsert in batches.
  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < upserts.length; i += BATCH) {
    const slice = upserts.slice(i, i + BATCH);
    const { error } = await admin
      .from("customer_cohorts")
      .upsert(slice, { onConflict: "customer_email" });
    if (error) {
      return new Response(JSON.stringify({ error: error.message, written }), { status: 500, headers: corsHeaders });
    }
    written += slice.length;
  }

  return new Response(JSON.stringify({
    ok: true,
    unique_customers: aggregates.size,
    upserted: written,
    club_members_flagged: clubEmails.size,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});