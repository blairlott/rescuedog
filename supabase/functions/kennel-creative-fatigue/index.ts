// Computes per-(channel, ad_id) creative fatigue from ad_performance_facts.
// ctr_7d vs ctr_30d_baseline → fatigue_score in [0,1]. Above threshold,
// also writes an ad_recommendation (kind=creative_refresh) so it surfaces
// in the Recommendations queue with confidence proportional to data volume.
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

const MIN_IMPRESSIONS_7D = 1000;
const FATIGUE_REC_THRESHOLD = 0.40; // ≥40% decay vs 30d baseline

interface FactRow {
  channel_id: string;
  platform: string;
  ad_id: string;
  date: string;
  impressions: number;
  clicks: number;
}

function fmtDay(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const today = new Date();
    const since30 = new Date(today.getTime() - 30 * 86_400_000);
    const since7 = new Date(today.getTime() - 7 * 86_400_000);

    const { data: facts, error } = await SB
      .from("ad_performance_facts")
      .select("channel_id, platform, ad_id, date, impressions, clicks")
      .gte("date", fmtDay(since30))
      .not("ad_id", "is", null)
      .limit(200000);
    if (error) throw error;

    // Aggregate per (channel_id, ad_id) for 7d and 30d windows
    type Agg = { channel_id: string; platform: string; ad_id: string; imp7: number; clk7: number; imp30: number; clk30: number };
    const buckets = new Map<string, Agg>();
    const since7Day = fmtDay(since7);
    for (const f of facts ?? [] as FactRow[]) {
      const k = `${f.channel_id}|${f.ad_id}`;
      let b = buckets.get(k);
      if (!b) {
        b = { channel_id: f.channel_id, platform: f.platform, ad_id: f.ad_id, imp7: 0, clk7: 0, imp30: 0, clk30: 0 };
        buckets.set(k, b);
      }
      const imp = Number(f.impressions ?? 0), clk = Number(f.clicks ?? 0);
      b.imp30 += imp; b.clk30 += clk;
      if (f.date >= since7Day) { b.imp7 += imp; b.clk7 += clk; }
    }

    let upserted = 0, recsWritten = 0;
    for (const b of buckets.values()) {
      if (b.imp7 < MIN_IMPRESSIONS_7D) continue;
      const ctr7 = b.imp7 > 0 ? b.clk7 / b.imp7 : 0;
      const ctr30 = b.imp30 > 0 ? b.clk30 / b.imp30 : 0;
      const decay = ctr30 > 0 ? Math.max(0, (ctr30 - ctr7) / ctr30) : 0;
      const fatigue = Math.min(1, decay);

      if (!dryRun) {
        await SB.from("creative_fatigue").upsert({
          channel: b.platform,
          creative_id: b.ad_id,
          impressions_7d: b.imp7,
          ctr_7d: Number(ctr7.toFixed(4)),
          ctr_30d_baseline: Number(ctr30.toFixed(4)),
          fatigue_score: Number(fatigue.toFixed(3)),
          computed_at: new Date().toISOString(),
        }, { onConflict: "channel,creative_id" });
        upserted++;
      }

      if (fatigue >= FATIGUE_REC_THRESHOLD && !dryRun) {
        // Idempotency: skip if a pending rec already exists for this creative today
        const today_iso = fmtDay(today);
        const ingest_id = `fatigue:${b.platform}:${b.ad_id}:${today_iso}`;
        const confidence = Math.min(0.95, 0.5 + (b.imp7 / 50_000) * 0.4 + fatigue * 0.1);
        await SB.from("ad_recommendations").upsert({
          channel_id: b.channel_id,
          kind: "creative_refresh",
          title: `Refresh fatigued creative on ${b.platform}`,
          summary: `Ad ${b.ad_id} CTR fell ${(fatigue * 100).toFixed(0)}% vs 30d baseline (${(ctr7 * 100).toFixed(2)}% vs ${(ctr30 * 100).toFixed(2)}%).`,
          rationale: `7d impressions: ${b.imp7.toLocaleString()}. Replace creative or rotate to a fresh variant.`,
          projected_impact_cents: 0,
          confidence: Number(confidence.toFixed(3)),
          status: "pending",
          source: "native",
          payload: { ad_id: b.ad_id, platform: b.platform, ctr_7d: ctr7, ctr_30d: ctr30, fatigue_score: fatigue, impressions_7d: b.imp7 },
          ingest_request_id: ingest_id,
          expires_at: new Date(today.getTime() + 7 * 86_400_000).toISOString(),
        }, { onConflict: "ingest_request_id", ignoreDuplicates: true });
        recsWritten++;
      }
    }

    return J(200, {
      ok: true, dry_run: dryRun,
      creatives_evaluated: buckets.size,
      rows_upserted: upserted,
      recommendations_written: recsWritten,
    });
  } catch (e: any) {
    console.error("kennel-creative-fatigue", e);
    return J(500, { error: String(e?.message ?? e) });
  }
});