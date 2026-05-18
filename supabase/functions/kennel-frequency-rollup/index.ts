// Campaign-level frequency / saturation proxy.
// Per (channel_id, campaign_id), compute 7d vs 30d impressions per conversion.
// When 7d imp/conv is >= SATURATION_MULTIPLIER × 30d baseline and 7d impressions
// are material, emit an ad_recommendations row (kind=frequency_cap) so ad-ops
// can dial back frequency or expand the audience.
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

const MIN_IMPRESSIONS_7D = 5000;
const MIN_CONVERSIONS_30D = 5;
const SATURATION_MULTIPLIER = 1.5; // 7d takes >= 1.5x more impressions per conv than 30d

function fmtDay(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const today = new Date();
    const since30 = new Date(today.getTime() - 30 * 86_400_000);
    const since7Day = fmtDay(new Date(today.getTime() - 7 * 86_400_000));

    const { data: facts, error } = await SB
      .from("ad_performance_facts")
      .select("channel_id, platform, campaign_id, campaign_name, date, impressions, conversions")
      .gte("date", fmtDay(since30))
      .not("campaign_id", "is", null)
      .limit(200000);
    if (error) throw error;

    type Agg = {
      channel_id: string; platform: string; campaign_id: string; campaign_name: string | null;
      imp7: number; conv7: number; imp30: number; conv30: number;
    };
    const buckets = new Map<string, Agg>();
    for (const f of (facts ?? []) as any[]) {
      const k = `${f.channel_id}|${f.campaign_id}`;
      let b = buckets.get(k);
      if (!b) {
        b = { channel_id: f.channel_id, platform: f.platform, campaign_id: f.campaign_id,
              campaign_name: f.campaign_name ?? null, imp7: 0, conv7: 0, imp30: 0, conv30: 0 };
        buckets.set(k, b);
      }
      const imp = Number(f.impressions ?? 0), conv = Number(f.conversions ?? 0);
      b.imp30 += imp; b.conv30 += conv;
      if (f.date >= since7Day) { b.imp7 += imp; b.conv7 += conv; }
    }

    let upserted = 0, recsWritten = 0;
    const today_iso = fmtDay(today);
    for (const b of buckets.values()) {
      if (b.imp7 < MIN_IMPRESSIONS_7D) continue;
      if (b.conv30 < MIN_CONVERSIONS_30D) continue;
      const ipc7 = b.conv7 > 0 ? b.imp7 / b.conv7 : (b.imp7 || 0);
      const ipc30 = b.conv30 > 0 ? b.imp30 / b.conv30 : (b.imp30 || 0);
      const ratio = ipc30 > 0 ? ipc7 / ipc30 : 0;
      const saturation = Math.min(1, Math.max(0, (ratio - 1) / 2)); // ratio 1→0, 3→1

      if (!dryRun) {
        await SB.from("ad_frequency_rollup").upsert({
          channel_id: b.channel_id,
          platform: b.platform,
          campaign_id: b.campaign_id,
          campaign_name: b.campaign_name,
          impressions_7d: b.imp7,
          conversions_7d: b.conv7,
          impressions_30d: b.imp30,
          conversions_30d: b.conv30,
          imp_per_conv_7d: Number(ipc7.toFixed(2)),
          imp_per_conv_30d: Number(ipc30.toFixed(2)),
          saturation_score: Number(saturation.toFixed(3)),
          computed_at: new Date().toISOString(),
        }, { onConflict: "channel_id,campaign_id" });
        upserted++;
      }

      if (ratio >= SATURATION_MULTIPLIER && !dryRun) {
        const ingest_id = `freq:${b.platform}:${b.campaign_id}:${today_iso}`;
        const confidence = Math.min(0.9, 0.45 + saturation * 0.4 + Math.min(0.1, b.imp7 / 500_000));
        await SB.from("ad_recommendations").upsert({
          channel_id: b.channel_id,
          kind: "frequency_cap",
          title: `Reduce frequency on ${b.platform} campaign`,
          summary: `${b.campaign_name ?? b.campaign_id} is using ${ratio.toFixed(1)}× more impressions per conversion vs 30d baseline.`,
          rationale: `7d: ${b.imp7.toLocaleString()} imp / ${b.conv7} conv (${ipc7.toFixed(0)} imp/conv). 30d baseline: ${ipc30.toFixed(0)} imp/conv. Lower daily frequency cap or expand audience.`,
          projected_impact_cents: 0,
          confidence: Number(confidence.toFixed(3)),
          status: "pending",
          source: "native",
          payload: {
            campaign_id: b.campaign_id, platform: b.platform,
            imp_per_conv_7d: ipc7, imp_per_conv_30d: ipc30, ratio, saturation_score: saturation,
            impressions_7d: b.imp7, conversions_7d: b.conv7,
          },
          ingest_request_id: ingest_id,
          expires_at: new Date(today.getTime() + 7 * 86_400_000).toISOString(),
        }, { onConflict: "ingest_request_id", ignoreDuplicates: true });
        recsWritten++;
      }
    }

    return J(200, {
      ok: true, dry_run: dryRun,
      campaigns_evaluated: buckets.size,
      rows_upserted: upserted,
      recommendations_written: recsWritten,
    });
  } catch (e: any) {
    console.error("kennel-frequency-rollup", e);
    return J(500, { error: String(e?.message ?? e) });
  }
});