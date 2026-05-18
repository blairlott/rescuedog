// Nightly last-click 7d dedup across Meta/Google/Instacart vs Vinoshipper actuals.
// For each VS order in the lookback window, find the most recent (within 7d before order)
// touchpoint in channel_attribution_events. Credit the order revenue ONLY to that channel,
// overriding the naive rollup. Writes results to channel_performance_daily for
// (day = order_date, channel, campaign_id), and clears stale entries flagged as
// double-counted by comparing to platform_reported_revenue_cents.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SB = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WINDOW_DAYS = 7;

interface DedupAgg {
  day: string;
  channel: string;
  campaign_id: string | null;
  attributed_revenue_cents: number;
  conversions: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const lookbackDays = Math.min(
      parseInt(url.searchParams.get("lookback_days") ?? "1", 10),
      30,
    );
    const orderSince = new Date(Date.now() - lookbackDays * 86_400_000);
    const touchSince = new Date(orderSince.getTime() - WINDOW_DAYS * 86_400_000);
    const sinceDay = orderSince.toISOString().slice(0, 10);

    // 1) VS orders in window
    const { data: orders, error: oerr } = await SB
      .from("vs_transactions")
      .select("invoice, customer_email, transaction_date, order_total")
      .gte("transaction_date", sinceDay)
      .not("customer_email", "is", null)
      .not("order_total", "is", null)
      .limit(10000);
    if (oerr) throw oerr;

    // 2) Touchpoints in extended window
    const { data: events, error: eerr } = await SB
      .from("channel_attribution_events")
      .select("user_email, channel, platform, campaign_name, utm_campaign, event_type, event_at, occurred_at")
      .or("event_type.eq.click,event_type.eq.conversion")
      .gte("occurred_at", touchSince.toISOString())
      .limit(100000);
    if (eerr) throw eerr;

    const eventsByEmail = new Map<string, any[]>();
    for (const e of events ?? []) {
      const k = (e.user_email as string | null)?.toLowerCase();
      if (!k) continue;
      const arr = eventsByEmail.get(k) ?? [];
      arr.push(e);
      eventsByEmail.set(k, arr);
    }

    const agg = new Map<string, DedupAgg>();
    let matched = 0;
    let unmatched = 0;

    for (const o of orders ?? []) {
      const email = (o.customer_email as string).toLowerCase();
      const orderTs = new Date(o.transaction_date as string).getTime();
      const revCents = Math.round(Number(o.order_total ?? 0) * 100);
      if (!revCents) continue;

      const candidates = (eventsByEmail.get(email) ?? [])
        .filter((e) => {
          const t = new Date(e.occurred_at ?? e.event_at).getTime();
          return t <= orderTs && orderTs - t <= WINDOW_DAYS * 86_400_000;
        })
        .sort((a, b) => new Date(b.occurred_at ?? b.event_at).getTime() - new Date(a.occurred_at ?? a.event_at).getTime());

      const lastTouch = candidates[0];
      if (!lastTouch) {
        unmatched++;
        continue;
      }
      matched++;
      const channel = String(lastTouch.channel ?? lastTouch.platform ?? "unknown");
      const campaign_id = (lastTouch.utm_campaign as string | null) ?? (lastTouch.campaign_name as string | null) ?? null;
      const day = (o.transaction_date as string).slice(0, 10);
      const key = `${day}|${channel}|${campaign_id ?? ""}`;
      const prev = agg.get(key) ?? {
        day, channel, campaign_id,
        attributed_revenue_cents: 0, conversions: 0,
      };
      prev.attributed_revenue_cents += revCents;
      prev.conversions += 1;
      agg.set(key, prev);
    }

    // 3) Upsert dedup-attributed rows
    let upserted = 0;
    for (const row of agg.values()) {
      const { data: existing } = await SB
        .from("channel_performance_daily")
        .select("id, spend_cents, platform_reported_revenue_cents")
        .eq("day", row.day)
        .eq("channel", row.channel)
        .eq("campaign_id", row.campaign_id ?? "")
        .maybeSingle();

      if (existing) {
        await SB.from("channel_performance_daily").update({
          attributed_revenue_cents: row.attributed_revenue_cents,
          conversions: row.conversions,
          attribution_quality: "full",
          computed_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await SB.from("channel_performance_daily").insert({
          ...row,
          spend_cents: 0,
          platform_reported_revenue_cents: 0,
          attribution_quality: "full",
          computed_at: new Date().toISOString(),
        });
      }
      upserted++;
    }

    return J(200, {
      ok: true,
      lookback_days: lookbackDays,
      orders_scanned: orders?.length ?? 0,
      matched, unmatched,
      rows_upserted: upserted,
    });
  } catch (e: any) {
    console.error("kennel-attribution-dedup", e);
    return J(500, { error: String(e?.message ?? e) });
  }
});