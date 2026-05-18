// Fetches 48h forecasts from OpenWeather for a curated DMA list and writes
// weather_signals rows. When a heat-wave signal is detected (max temp ≥ 85F),
// also emits an ad_recommendations row (kind=geo_bid_boost) suggesting a
// rosé / chilled-wine bid bump in that DMA. Idempotent per (dma, date, signal).
// Skips cleanly with skipped_no_secret if OPENWEATHER_API_KEY is unset.
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
const OW_KEY = Deno.env.get("OPENWEATHER_API_KEY");

const HEAT_THRESHOLD_F = 85;
const COLD_THRESHOLD_F = 35;

// Top US wine-consumption DMAs with a representative lat/lon and region.
// Override via POST body `{ dmas: [{ dma, region, lat, lon }, ...] }`.
const DEFAULT_DMAS: Array<{ dma: string; region: string; lat: number; lon: number }> = [
  { dma: "501",  region: "New York NY",      lat: 40.7128, lon: -74.0060 },
  { dma: "803",  region: "Los Angeles CA",   lat: 34.0522, lon: -118.2437 },
  { dma: "807",  region: "San Francisco CA", lat: 37.7749, lon: -122.4194 },
  { dma: "602",  region: "Chicago IL",       lat: 41.8781, lon: -87.6298 },
  { dma: "504",  region: "Philadelphia PA",  lat: 39.9526, lon: -75.1652 },
  { dma: "511",  region: "Washington DC",    lat: 38.9072, lon: -77.0369 },
  { dma: "506",  region: "Boston MA",        lat: 42.3601, lon: -71.0589 },
  { dma: "528",  region: "Miami FL",         lat: 25.7617, lon: -80.1918 },
  { dma: "623",  region: "Dallas TX",        lat: 32.7767, lon: -96.7970 },
  { dma: "618",  region: "Houston TX",       lat: 29.7604, lon: -95.3698 },
  { dma: "751",  region: "Denver CO",        lat: 39.7392, lon: -104.9903 },
  { dma: "819",  region: "Seattle WA",       lat: 47.6062, lon: -122.3321 },
  { dma: "820",  region: "Portland OR",      lat: 45.5152, lon: -122.6784 },
  { dma: "753",  region: "Phoenix AZ",       lat: 33.4484, lon: -112.0740 },
  { dma: "524",  region: "Atlanta GA",       lat: 33.7490, lon: -84.3880 },
];

function fmtDay(d: Date) { return d.toISOString().slice(0, 10); }
const cToF = (c: number) => (c * 9) / 5 + 32;

async function fetchForecast(lat: number, lon: number): Promise<any | null> {
  // OpenWeather 5-day / 3h forecast — free tier, no One Call subscription needed.
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${OW_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return await r.json();
}

// Reduce 3h forecast list → per-date {min,max,conditions[]}.
function rollupByDay(forecast: any): Map<string, { min: number; max: number; conds: string[] }> {
  const out = new Map<string, { min: number; max: number; conds: string[] }>();
  for (const slot of forecast?.list ?? []) {
    const day = (slot.dt_txt ?? "").slice(0, 10);
    if (!day) continue;
    const t = Number(slot?.main?.temp ?? NaN);
    if (!isFinite(t)) continue;
    const main = slot?.weather?.[0]?.main ?? "";
    let row = out.get(day);
    if (!row) { row = { min: t, max: t, conds: [] }; out.set(day, row); }
    if (t < row.min) row.min = t;
    if (t > row.max) row.max = t;
    if (main && !row.conds.includes(main)) row.conds.push(main);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (!OW_KEY) {
      return J(200, { ok: true, skipped: "no_openweather_api_key" });
    }

    let dmas = DEFAULT_DMAS;
    let dryRun = new URL(req.url).searchParams.get("dry_run") === "true";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (Array.isArray(body?.dmas) && body.dmas.length) dmas = body.dmas;
        if (typeof body?.dry_run === "boolean") dryRun = body.dry_run;
      } catch { /* ignore */ }
    }

    const meta = await SB.from("ad_channels").select("id,platform").eq("platform", "meta").maybeSingle();
    const metaChannelId = meta?.data?.id ?? null;

    const today = new Date();
    let signalsWritten = 0, recsWritten = 0, errors = 0;
    const horizonDays = 2;
    const horizonCutoff = fmtDay(new Date(today.getTime() + horizonDays * 86_400_000));

    for (const d of dmas) {
      const fc = await fetchForecast(d.lat, d.lon);
      if (!fc) { errors++; continue; }
      const rolled = rollupByDay(fc);

      for (const [day, row] of rolled) {
        if (day > horizonCutoff) continue;
        const maxF = row.max, minF = row.min;
        const condition = row.conds[0] ?? null;

        const signals: Array<{ kind: string; payload: any }> = [];
        if (maxF >= HEAT_THRESHOLD_F) {
          signals.push({
            kind: "heat_wave",
            payload: { theme: "chilled_white_rosé", suggested_bid_delta_pct: 20, max_temp_f: maxF },
          });
        }
        if (minF <= COLD_THRESHOLD_F) {
          signals.push({
            kind: "cold_snap",
            payload: { theme: "red_wine_cozy", suggested_bid_delta_pct: 15, min_temp_f: minF },
          });
        }

        for (const s of signals) {
          if (!dryRun) {
            await SB.from("weather_signals").upsert({
              dma: d.dma,
              region: d.region,
              forecast_date: day,
              max_temp_f: maxF,
              min_temp_f: minF,
              condition,
              signal_kind: s.kind,
              payload: s.payload,
              computed_at: new Date().toISOString(),
            }, { onConflict: "dma,forecast_date,signal_kind" });
            signalsWritten++;

            if (metaChannelId) {
              const ingest_id = `weather:${s.kind}:${d.dma}:${day}`;
              await SB.from("ad_recommendations").upsert({
                channel_id: metaChannelId,
                kind: "geo_bid_boost",
                title: `${s.kind === "heat_wave" ? "Heat wave" : "Cold snap"} in ${d.region} on ${day}`,
                summary: `${d.region} forecast: ${minF.toFixed(0)}°F – ${maxF.toFixed(0)}°F (${condition ?? "—"}). Bias ${s.payload.theme.replace(/_/g, " ")} bids +${s.payload.suggested_bid_delta_pct}% in DMA ${d.dma}.`,
                rationale: `Auto-generated from OpenWeather 5d/3h forecast. Acts on the next ${horizonDays} day(s).`,
                projected_impact_cents: 0,
                confidence: 0.6,
                status: "pending",
                source: "native",
                payload: { ...s.payload, dma: d.dma, region: d.region, forecast_date: day, condition },
                ingest_request_id: ingest_id,
                expires_at: new Date(new Date(day).getTime() + 2 * 86_400_000).toISOString(),
              }, { onConflict: "ingest_request_id", ignoreDuplicates: true });
              recsWritten++;
            }
          } else {
            signalsWritten++;
          }
        }
      }
    }

    return J(200, {
      ok: true, dry_run: dryRun,
      dmas_evaluated: dmas.length,
      signals_written: signalsWritten,
      recommendations_written: recsWritten,
      fetch_errors: errors,
    });
  } catch (e: any) {
    console.error("kennel-weather-signals", e);
    return J(500, { error: String(e?.message ?? e) });
  }
});