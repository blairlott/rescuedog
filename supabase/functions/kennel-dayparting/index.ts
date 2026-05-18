// Per (channel, campaign_id, day_of_week, hour_of_day) bid modifier from
// last 28d of ad_performance_facts. Compares the slot's conversion rate
// (conversions / clicks) vs the channel-wide average, derives a bid modifier
// pct = ((cr_slot / cr_channel) - 1) * 100, clamped to ±50%.
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

const LOOKBACK_DAYS = 28;
const MIN_SLOT_CLICKS = 50;
const MIN_BASIS_CONVERSIONS = 3;
const MOD_CAP = 50; // %

function fmtDay(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

    const { data: facts, error } = await SB
      .from("ad_performance_facts")
      .select("platform, campaign_id, date, hour, clicks, conversions")
      .gte("date", fmtDay(since))
      .not("hour", "is", null)
      .limit(200000);
    if (error) throw error;

    // Channel-wide baseline + per-slot aggregates
    type Slot = { channel: string; campaign_id: string | null; dow: number; hour: number; clicks: number; conv: number };
    const channelAgg = new Map<string, { clicks: number; conv: number }>();
    const slotAgg = new Map<string, Slot>();

    for (const f of facts ?? []) {
      const clicks = Number(f.clicks ?? 0);
      const conv = Number(f.conversions ?? 0);
      if (clicks === 0 && conv === 0) continue;
      const ch = String(f.platform);
      const ca = channelAgg.get(ch) ?? { clicks: 0, conv: 0 };
      ca.clicks += clicks; ca.conv += conv;
      channelAgg.set(ch, ca);

      const dow = new Date(f.date as string).getUTCDay(); // 0..6
      const hour = Number(f.hour);
      const campaign_id = (f.campaign_id as string | null) ?? null;
      const key = `${ch}|${campaign_id ?? ""}|${dow}|${hour}`;
      const s = slotAgg.get(key) ?? { channel: ch, campaign_id, dow, hour, clicks: 0, conv: 0 };
      s.clicks += clicks; s.conv += conv;
      slotAgg.set(key, s);
    }

    let upserted = 0, skipped = 0;
    for (const s of slotAgg.values()) {
      const baseline = channelAgg.get(s.channel);
      if (!baseline || baseline.clicks === 0) { skipped++; continue; }
      if (s.clicks < MIN_SLOT_CLICKS || s.conv < MIN_BASIS_CONVERSIONS) { skipped++; continue; }
      const crSlot = s.conv / s.clicks;
      const crChannel = baseline.conv / baseline.clicks;
      if (crChannel === 0) { skipped++; continue; }
      const raw = (crSlot / crChannel - 1) * 100;
      const mod = Math.max(-MOD_CAP, Math.min(MOD_CAP, raw));

      if (!dryRun) {
        await SB.from("dayparting_recommendations").upsert({
          channel: s.channel,
          campaign_id: s.campaign_id,
          day_of_week: s.dow,
          hour_of_day: s.hour,
          recommended_bid_modifier_pct: Number(mod.toFixed(2)),
          basis_conversions: s.conv,
          computed_at: new Date().toISOString(),
        }, { onConflict: "channel,day_of_week,hour_of_day" });
        upserted++;
      }
    }

    return J(200, {
      ok: true, dry_run: dryRun,
      lookback_days: LOOKBACK_DAYS,
      slots_seen: slotAgg.size,
      slots_skipped: skipped,
      rows_upserted: upserted,
    });
  } catch (e: any) {
    console.error("kennel-dayparting", e);
    return J(500, { error: String(e?.message ?? e) });
  }
});