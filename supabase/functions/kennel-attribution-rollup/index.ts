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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const lookbackDays = Math.min(
      parseInt(url.searchParams.get("lookback_days") ?? "7", 10),
      90,
    );
    const since = new Date(Date.now() - lookbackDays * 86400_000);

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

    // Aggregate by day × channel × campaign
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

    // Upsert rows
    const rows = Array.from(agg.values()).map((r) => ({
      day: r.day,
      channel: r.channel,
      campaign_id: r.campaign_id,
      attributed_revenue_cents: r.attributed_revenue_cents,
      conversions: r.conversions,
      attribution_quality:
        new Date(r.day) < UTM_TAG_CUTOFF ? "partial" : "full",
      computed_at: new Date().toISOString(),
    }));

    let upserted = 0;
    if (rows.length > 0) {
      // Manual upsert preserves spend_cents written by spend-ingest jobs
      for (const row of rows) {
        const { error } = await supabase.rpc("noop_no_such_fn", {});
        // Use direct upsert via select-then-update pattern
        const { data: existing } = await supabase
          .from("channel_performance_daily")
          .select("id, spend_cents, platform_reported_revenue_cents")
          .eq("day", row.day)
          .eq("channel", row.channel)
          .eq("campaign_id", row.campaign_id ?? "")
          .maybeSingle();

        if (existing) {
          await supabase
            .from("channel_performance_daily")
            .update({
              attributed_revenue_cents: row.attributed_revenue_cents,
              conversions: row.conversions,
              attribution_quality: row.attribution_quality,
              computed_at: row.computed_at,
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("channel_performance_daily").insert({
            ...row,
            spend_cents: 0,
            platform_reported_revenue_cents: 0,
          });
        }
        upserted++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lookback_days: lookbackDays,
        events_processed: events?.length ?? 0,
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