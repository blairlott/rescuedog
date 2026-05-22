import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// May 15 2026 = GTM Tag 92 go-live. Orders before this have partial attribution.
const UTM_TAG_CUTOFF = new Date("2026-05-15T00:00:00Z");

interface ChannelDayAgg {
  day: string;
  channel: string;
  campaign_id: string | null;
  attributed_revenue_cents: number;
  conversions: number;
}

function platformToChannel(p: string | null | undefined): string {
  const v = (p ?? "").toLowerCase();
  if (!v) return "unknown";
  if (v === "facebook" || v === "meta") return "meta";
  if (v === "google" || v === "google_ads") return "google";
  if (v === "instacart" || v === "instacart_ads") return "instacart";
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    let bodyLookback: number | null = null;
    if (req.method === "POST") {
      try {
        const b = await req.json();
        if (b && Number.isFinite(Number(b.lookback_days))) bodyLookback = Number(b.lookback_days);
      } catch { /* ignore */ }
    }
    const lookbackDays = Math.min(
      Math.max(1, bodyLookback ?? parseInt(url.searchParams.get("lookback_days") ?? "30", 10)),
      90,
    );
    const since = new Date(Date.now() - lookbackDays * 86400_000);
    const sinceDate = since.toISOString().slice(0, 10);

    // Pull all conversion events in the lookback window
    const { data: events, error: evErr } = await supabase
      .from("channel_attribution_events")
      .select(
        "channel, utm_campaign, order_id, order_value_cents, occurred_at",
      )
      .eq("event_type", "conversion")
      .gte("occurred_at", since.toISOString())
      .not("channel", "is", null)
      .limit(10000);
    if (evErr) throw evErr;

    // Aggregate attributed conversions by day × channel × campaign
    const agg = new Map<string, ChannelDayAgg>();
    for (const e of events ?? []) {
      const day = (e.occurred_at as string).slice(0, 10);
      const channel = e.channel as string;
      const campaign_id = (e.utm_campaign as string | null) ?? null;
      const key = `${day}|${channel}|${campaign_id ?? ""}`;
      const prev = agg.get(key) ?? {
        day,
        channel,
        campaign_id,
        attributed_revenue_cents: 0,
        conversions: 0,
      };
      prev.attributed_revenue_cents += e.order_value_cents ?? 0;
      prev.conversions += 1;
      agg.set(key, prev);
    }

    // Also pull platform spend + revenue from ad_performance_facts so the
    // True ROAS dashboard shows real channel performance even when the
    // UTM-tagged attribution stream is sparse.
    const { data: facts, error: factsErr } = await supabase
      .from("ad_performance_facts")
      .select("date, platform, campaign_id, spend, revenue, conversions")
      .gte("date", sinceDate)
      .limit(50000);
    if (factsErr) throw factsErr;

    type FactAgg = {
      day: string; channel: string; campaign_id: string | null;
      spend_cents: number; platform_reported_revenue_cents: number; platform_conversions: number;
    };
    const factAgg = new Map<string, FactAgg>();
    for (const f of facts ?? []) {
      const day = String(f.date);
      const channel = platformToChannel(f.platform as string | null);
      const campaign_id = (f.campaign_id as string | null) ?? null;
      const key = `${day}|${channel}|${campaign_id ?? ""}`;
      const prev = factAgg.get(key) ?? {
        day, channel, campaign_id,
        spend_cents: 0, platform_reported_revenue_cents: 0, platform_conversions: 0,
      };
      prev.spend_cents += Math.round((Number(f.spend) || 0) * 100);
      prev.platform_reported_revenue_cents += Math.round((Number(f.revenue) || 0) * 100);
      prev.platform_conversions += Number(f.conversions) || 0;
      factAgg.set(key, prev);
    }

    // Merge the two streams keyed by day|channel|campaign_id.
    const merged = new Map<string, {
      day: string; channel: string; campaign_id: string | null;
      spend_cents: number; platform_reported_revenue_cents: number;
      attributed_revenue_cents: number; conversions: number;
    }>();
    for (const [k, v] of factAgg.entries()) {
      merged.set(k, {
        day: v.day, channel: v.channel, campaign_id: v.campaign_id,
        spend_cents: v.spend_cents,
        platform_reported_revenue_cents: v.platform_reported_revenue_cents,
        attributed_revenue_cents: 0,
        conversions: v.platform_conversions,
      });
    }
    for (const [k, v] of agg.entries()) {
      const prev = merged.get(k) ?? {
        day: v.day, channel: v.channel, campaign_id: v.campaign_id,
        spend_cents: 0, platform_reported_revenue_cents: 0,
        attributed_revenue_cents: 0, conversions: 0,
      };
      prev.attributed_revenue_cents += v.attributed_revenue_cents;
      // Prefer event-side conversion count when available.
      prev.conversions = v.conversions || prev.conversions;
      merged.set(k, prev);
    }

    const computedAt = new Date().toISOString();
    let upserted = 0;
    for (const row of merged.values()) {
      const hasAttributed = row.attributed_revenue_cents > 0;
      const quality = new Date(row.day) < UTM_TAG_CUTOFF
        ? "partial"
        : (hasAttributed ? "full" : "unmatched");

      const { data: existing } = await supabase
        .from("channel_performance_daily")
        .select("id")
        .eq("day", row.day)
        .eq("channel", row.channel)
        .eq("campaign_id", row.campaign_id ?? "")
        .maybeSingle();

      if (existing) {
        await supabase.from("channel_performance_daily").update({
          spend_cents: row.spend_cents,
          platform_reported_revenue_cents: row.platform_reported_revenue_cents,
          attributed_revenue_cents: row.attributed_revenue_cents,
          conversions: row.conversions,
          attribution_quality: quality,
          computed_at: computedAt,
        }).eq("id", existing.id);
      } else {
        await supabase.from("channel_performance_daily").insert({
          day: row.day,
          channel: row.channel,
          campaign_id: row.campaign_id,
          spend_cents: row.spend_cents,
          platform_reported_revenue_cents: row.platform_reported_revenue_cents,
          attributed_revenue_cents: row.attributed_revenue_cents,
          conversions: row.conversions,
          attribution_quality: quality,
          computed_at: computedAt,
        });
      }
      upserted++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lookback_days: lookbackDays,
        events_processed: events?.length ?? 0,
        facts_processed: facts?.length ?? 0,
        rows_upserted: upserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("kennel-attribution-rollup error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});