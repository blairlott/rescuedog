// Nightly trend scanner. Writes findings to kennel_insights with daily_values for sparklines.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Insight = {
  insight_type: string;
  scope_key: string;
  title: string;
  summary: string;
  data: Record<string, unknown>;
  severity: "info" | "warning" | "opportunity" | "high" | "medium" | "low";
};

async function fetchDailyOrderCounts(admin: any, days: number): Promise<Record<string, number>> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("vs_transactions")
    .select("transaction_date, order_total")
    .gte("transaction_date", since)
    .gt("order_total", 0);
  const counts: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    counts[d] = 0;
  }
  for (const r of data ?? []) counts[r.transaction_date] = (counts[r.transaction_date] ?? 0) + 1;
  return counts;
}

function dailyValuesLast14(counts: Record<string, number>): number[] {
  const out: number[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push(counts[d] ?? 0);
  }
  return out;
}

async function run(admin: any) {
  const insights: Insight[] = [];

  // ---------- AOV trend (7d vs 30d) ----------
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: aovRows } = await admin
    .from("vs_transactions")
    .select("transaction_date, order_total")
    .gte("transaction_date", since30)
    .gt("order_total", 0);
  const aovDaily: Record<string, { sum: number; n: number }> = {};
  for (const r of aovRows ?? []) {
    const d = r.transaction_date as string;
    aovDaily[d] ??= { sum: 0, n: 0 };
    aovDaily[d].sum += Number(r.order_total);
    aovDaily[d].n += 1;
  }
  const last7 = (aovRows ?? []).filter(r => r.transaction_date >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const aov7 = last7.length ? last7.reduce((s, r) => s + Number(r.order_total), 0) / last7.length : 0;
  const aov30 = (aovRows?.length ?? 0) ? (aovRows ?? []).reduce((s, r) => s + Number(r.order_total), 0) / (aovRows?.length ?? 1) : 0;
  if (aov30 > 0) {
    const shift = (aov7 - aov30) / aov30;
    if (Math.abs(shift) >= 0.1) {
      const daily14: number[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const b = aovDaily[d];
        daily14.push(b && b.n ? Math.round(b.sum / b.n) : 0);
      }
      insights.push({
        insight_type: "aov_trend", scope_key: "global",
        title: `AOV ${shift > 0 ? "up" : "down"} ${(shift * 100).toFixed(1)}% (7d vs 30d)`,
        summary: `7d AOV $${aov7.toFixed(0)} vs 30d $${aov30.toFixed(0)}`,
        data: { daily_values: daily14, aov_7d: aov7, aov_30d: aov30, shift_pct: shift * 100 },
        severity: shift > 0 ? "opportunity" : "warning",
      });
    }
  }

  // ---------- Geo spike (state, 7d vs prior 30d daily avg) ----------
  const { data: geoRows } = await admin
    .from("vs_transactions")
    .select("transaction_date, ship_to_state")
    .gte("transaction_date", new Date(Date.now() - 37 * 86400000).toISOString().slice(0, 10))
    .gt("order_total", 0);
  const byStateDate: Record<string, Record<string, number>> = {};
  for (const r of geoRows ?? []) {
    if (!r.ship_to_state) continue;
    byStateDate[r.ship_to_state] ??= {};
    byStateDate[r.ship_to_state][r.transaction_date] = (byStateDate[r.ship_to_state][r.transaction_date] ?? 0) + 1;
  }
  const cutoff7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  for (const [state, dates] of Object.entries(byStateDate)) {
    let recent = 0, prior = 0;
    for (const [d, c] of Object.entries(dates)) {
      if (d >= cutoff7) recent += c; else prior += c;
    }
    const priorDaily = prior / 30;
    const recentDaily = recent / 7;
    if (priorDaily >= 0.5 && recentDaily >= priorDaily * 2 && recent >= 3) {
      const daily14: number[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        daily14.push(dates[d] ?? 0);
      }
      insights.push({
        insight_type: "geo_spike", scope_key: `state:${state}`,
        title: `${state} order rate 2x+ normal`,
        summary: `${recent} orders in last 7d (vs ${(priorDaily * 7).toFixed(1)} expected)`,
        data: { daily_values: daily14, state, recent_7d: recent, prior_daily_avg: priorDaily },
        severity: "opportunity",
      });
    }
  }

  // ---------- Peak conversion windows (rolling 90d) ----------
  const { data: peakRows } = await admin
    .from("vs_transactions")
    .select("transaction_date, raw")
    .gte("transaction_date", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
    .gt("order_total", 0);
  const dowHour: Record<string, number> = {};
  for (const r of peakRows ?? []) {
    // transaction_date is date only; use noon as proxy if no timestamp available
    const ts = (r.raw && (r.raw.purchasedAt as string)) || `${r.transaction_date}T12:00:00Z`;
    const dt = new Date(ts);
    const k = `${dt.getUTCDay()}:${dt.getUTCHours()}`;
    dowHour[k] = (dowHour[k] ?? 0) + 1;
  }
  const top3 = Object.entries(dowHour).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top3.length) {
    insights.push({
      insight_type: "peak_windows", scope_key: "global",
      title: "Top 3 converting windows (last 90d)",
      summary: top3.map(([k, n]) => `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][Number(k.split(":")[0])]} ${k.split(":")[1]}:00 (${n})`).join(" · "),
      data: { top3: top3.map(([k, n]) => ({ dow: Number(k.split(":")[0]), hour: Number(k.split(":")[1]), count: n })) },
      severity: "info",
    });
  }

  // ---------- Cohort reactivation (lapsed who ordered in last 7d) ----------
  const { data: allOrders } = await admin
    .from("vs_transactions")
    .select("customer_email, transaction_date")
    .not("customer_email", "is", null);
  const lastByEmail: Record<string, string> = {};
  for (const r of allOrders ?? []) {
    const e = (r.customer_email as string).toLowerCase();
    if (!lastByEmail[e] || r.transaction_date > lastByEmail[e]) lastByEmail[e] = r.transaction_date;
  }
  // For each email, find the prior-to-last order
  const reactivated: string[] = [];
  const sevenAgo = cutoff7;
  const ninetyAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  // Build per-email sorted dates
  const byEmail: Record<string, string[]> = {};
  for (const r of allOrders ?? []) {
    const e = (r.customer_email as string).toLowerCase();
    (byEmail[e] ??= []).push(r.transaction_date);
  }
  for (const [e, dates] of Object.entries(byEmail)) {
    if (dates.length < 2) continue;
    dates.sort();
    const last = dates[dates.length - 1];
    const prev = dates[dates.length - 2];
    if (last >= sevenAgo && prev < ninetyAgo) reactivated.push(e);
  }
  if (reactivated.length >= 5) {
    insights.push({
      insight_type: "cohort_reactivation", scope_key: "global",
      title: `${reactivated.length} lapsed customers reactivated this week`,
      summary: `Lapsed buyers (90d+ inactive) placed orders in the last 7 days`,
      data: { count: reactivated.length, sample: reactivated.slice(0, 10) },
      severity: "opportunity",
    });
  }

  // ---------- Fast 2nd-order velocity ----------
  const gaps: number[] = [];
  for (const dates of Object.values(byEmail)) {
    if (dates.length < 2) continue;
    dates.sort();
    const gap = (new Date(dates[1]).getTime() - new Date(dates[0]).getTime()) / 86400000;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length >= 10) {
    const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    insights.push({
      insight_type: "second_order_velocity", scope_key: "global",
      title: `Median time-to-2nd-order: ${median.toFixed(0)} days`,
      summary: `Across ${gaps.length} repeat customers`,
      data: { median_days: median, sample_size: gaps.length },
      severity: "info",
    });
  }

  // Upsert (dedupe by insight_type+scope_key+day via unique index)
  for (const ins of insights) {
    await admin.from("kennel_insights").upsert(
      { ...ins, source: "internal" },
      { onConflict: "insight_type,scope_key" }, // partial — uniqueness includes date, handled by index
    ).select();
  }
  // Note: index uses date_trunc, so upsert via onConflict may not match. Use insert + on_conflict_do_nothing fallback.
  // Safer: try insert; ignore unique violations.
  return insights;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  // Service-role only (cron); also allow ad_ops manual trigger
  const auth = req.headers.get("Authorization") ?? "";
  const isServiceRole = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!isServiceRole) {
    if (!auth.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.slice(7));
    const uid = claims?.claims?.sub as string | undefined;
    if (!uid) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: isOps } = await admin.rpc("is_ad_ops", { _user_id: uid });
    if (!isOps) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const insights = await run(admin);
    // Insert with dedupe-by-day handled via on_conflict on the partial unique index;
    // simplest: try each insert and swallow unique violations
    let inserted = 0, skipped = 0;
    for (const i of insights) {
      const { error } = await admin.from("kennel_insights").insert({ ...i, source: "internal" });
      if (error) {
        if (String(error.message).includes("duplicate") || String(error.code) === "23505") skipped += 1;
        else throw error;
      } else inserted += 1;
    }
    return new Response(JSON.stringify({ ok: true, generated: insights.length, inserted, skipped }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});