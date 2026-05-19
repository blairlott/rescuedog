// Nightly recompute of day-of-week ad bid modifiers.
//
// Pulls the last N days of CONSUMER (non-wine-club) Vinoshipper orders,
// computes the average revenue per active day for each day-of-week, and
// expresses each as a multiplier vs. the overall daily average. Result is
// upserted into public.kennel_bid_modifiers so the Meta/Google ad sync
// jobs can read a single canonical bid curve.
//
// Trigger: pg_cron (nightly ~07:00 UTC) OR manual POST with header
//   x-kennel-ingest-secret: <KENNEL_INGEST_SECRET>
//
// Bounds: modifier clamped to [0.5, 2.0] so a noisy day can't blow up bids.
// Min sample: requires >= 3 active days for that DoW or we leave modifier=1.0.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";

const WINDOW_DAYS = 90;
const MIN_SAMPLE_DAYS = 3;
const MODIFIER_MIN = 0.5;
const MODIFIER_MAX = 2.0;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Allow either pg_cron (service role JWT) or a manual call with the shared secret.
  const provided = req.headers.get("x-kennel-ingest-secret") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const looksLikeServiceRole = auth.includes(SUPABASE_SERVICE_ROLE_KEY);
  if (!looksLikeServiceRole && (!INGEST_SECRET || provided !== INGEST_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  // Page through CONSUMER orders in the window.
  const PAGE = 1000;
  const rows: { transaction_date: string; order_total: number }[] = [];
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await supabase
      .from("vs_transactions")
      .select("transaction_date, order_total")
      .eq("transaction_type", "ORDER")
      .eq("order_type", "CONSUMER")
      .neq("chain_status", "Cancelled")
      .gte("transaction_date", cutoff)
      .gt("order_total", 0)
      .order("transaction_date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const r = (data ?? []) as { transaction_date: string; order_total: number }[];
    rows.push(...r);
    if (r.length < PAGE) break;
  }

  // Bucket revenue by (date, dow); then average across active days per dow.
  const byDate = new Map<string, { dow: number; revenue: number }>();
  for (const r of rows) {
    if (!r.transaction_date) continue;
    const d = new Date(r.transaction_date + "T00:00:00Z");
    const key = r.transaction_date;
    const dow = d.getUTCDay();
    const cur = byDate.get(key) ?? { dow, revenue: 0 };
    cur.revenue += Number(r.order_total) || 0;
    byDate.set(key, cur);
  }

  const dowStats: Record<number, { totalRev: number; days: number }> = {};
  for (let i = 0; i < 7; i++) dowStats[i] = { totalRev: 0, days: 0 };
  for (const v of byDate.values()) {
    dowStats[v.dow].totalRev += v.revenue;
    dowStats[v.dow].days += 1;
  }

  const avgPerDow: Record<number, number> = {};
  for (let i = 0; i < 7; i++) {
    avgPerDow[i] = dowStats[i].days > 0 ? dowStats[i].totalRev / dowStats[i].days : 0;
  }
  const overallAvg =
    Object.values(avgPerDow).reduce((s, v) => s + v, 0) /
    Math.max(1, Object.values(avgPerDow).filter(v => v > 0).length);

  const upserts = [];
  for (let dow = 0; dow < 7; dow++) {
    const stats = dowStats[dow];
    let modifier = 1.0;
    let notes = `consumer-only, ${WINDOW_DAYS}d window`;
    if (stats.days < MIN_SAMPLE_DAYS || overallAvg <= 0) {
      notes = `insufficient sample (${stats.days} active days) — held at 1.000`;
    } else {
      modifier = clamp(avgPerDow[dow] / overallAvg, MODIFIER_MIN, MODIFIER_MAX);
    }
    upserts.push({
      day_of_week: dow,
      modifier: Number(modifier.toFixed(3)),
      sample_avg_revenue_cents: Math.round(avgPerDow[dow] * 100),
      sample_days: stats.days,
      source_window_days: WINDOW_DAYS,
      notes,
      computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const { error: upErr } = await supabase
    .from("kennel_bid_modifiers")
    .upsert(upserts, { onConflict: "day_of_week" });

  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    window_days: WINDOW_DAYS,
    rows_considered: rows.length,
    overall_avg_revenue_cents: Math.round(overallAvg * 100),
    modifiers: upserts.map(u => ({ dow: u.day_of_week, modifier: u.modifier, sample_days: u.sample_days })),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});