// Instacart Ads → ad_performance_facts. Dimensional pull across all 7
// supported placements (display, shoppable display, brand pages, promotions,
// universal, video, search). Best-effort: skips quietly if API responds
// without the dimension; never throws across passes.
// deno-lint-ignore-file no-explicit-any
import { CORS, J, FactRow, isAuthorized, makeAdminClient, writeFacts, ensureChannel } from "../_shared/facts-writer.ts";

const BASE = "https://api.ads.instacart.com/api/v2";
const ADV = Deno.env.get("INSTACART_ADS_ADVERTISER_ID");
const WINDOW_DAYS = 90; // Instacart Reports API caps date ranges around this

let cachedToken: { token: string; expires_at: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) return cachedToken.token;
  const refresh = Deno.env.get("INSTACART_ADS_REFRESH_TOKEN");
  const cid = Deno.env.get("INSTACART_ADS_CLIENT_ID");
  const csec = Deno.env.get("INSTACART_ADS_CLIENT_SECRET");
  if (refresh && cid && csec) {
    const r = await fetch("https://api.ads.instacart.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refresh, client_id: cid, client_secret: csec }),
    });
    if (r.ok) {
      const b: any = await r.json().catch(() => ({}));
      if (b?.access_token) {
        cachedToken = { token: b.access_token, expires_at: Date.now() + Number(b.expires_in ?? 3600) * 1000 };
        return cachedToken.token;
      }
    }
  }
  return Deno.env.get("INSTACART_ADS_API_TOKEN") ?? null;
}

async function pull(path: string, params: Record<string, string>): Promise<{ rows: any[]; status: number; err?: string }> {
  const TOKEN = await getAccessToken();
  if (!TOKEN || !ADV) return { rows: [], status: 0, err: "no_token_or_adv" };
  const qs = new URLSearchParams({ advertiser_id: ADV, ...params });
  const url = `${BASE}${path}?${qs}`;
  const r = await fetch(url, { headers: { "Authorization": `Bearer ${TOKEN}` } });
  if (!r.ok) {
    const txt = (await r.text().catch(() => "")).slice(0, 240);
    return { rows: [], status: r.status, err: txt };
  }
  const b: any = await r.json().catch(() => ({}));
  return { rows: b?.data ?? b?.results ?? [], status: 200 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = makeAdminClient();
  if (!(await isAuthorized(req, sb))) return J(401, { error: "unauthorized" });
  const tok = await getAccessToken();
  if (!tok || !ADV) return J(400, { error: "instacart_credentials_missing_or_expired", hint: "Re-run OAuth at /functions/v1/oauth-instacart-callback to mint a fresh refresh_token, then update INSTACART_ADS_REFRESH_TOKEN." });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const days = Math.max(1, Math.min(Number(body.days ?? 30), 1095));
  // Build chunked windows of WINDOW_DAYS each, newest first.
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const windows: { start: string; end: string }[] = [];
  for (let offset = 0; offset < days; offset += WINDOW_DAYS) {
    const wEnd = new Date(today.getTime() - offset * 86400000);
    const span = Math.min(WINDOW_DAYS - 1, days - offset - 1);
    const wStart = new Date(wEnd.getTime() - span * 86400000);
    windows.push({ start: iso(wStart), end: iso(wEnd) });
  }

  const channel_id = await ensureChannel(sb, "instacart");
  if (!channel_id) return J(500, { error: "no instacart channel" });

  const passes: { name: string; path: string; breakdown?: string }[] = [
    { name: "campaign",        path: "/reports/campaign" },
    { name: "ad_group",        path: "/reports/ad_group" },
    { name: "creative",        path: "/reports/creative" },
    { name: "placement",       path: "/reports/placement" },
    { name: "region",          path: "/reports/region" },
    { name: "daypart",         path: "/reports/daypart" },
    { name: "format",          path: "/reports/format" }, // display/video/brand_page/coupon/universal
  ];

  const errors: string[] = [];
  let total = 0;
  const summary: Record<string, number> = {};

  for (const p of passes) {
    summary[p.name] = 0;
    for (const w of windows) {
      try {
        const { rows, status, err } = await pull(p.path, { start_date: w.start, end_date: w.end });
        if (status >= 400) {
          errors.push(`${p.name} ${w.start}..${w.end}: HTTP ${status} ${err ?? ""}`.slice(0, 240));
          continue;
        }
        const facts: FactRow[] = rows.map((r: any): FactRow => ({
          channel_id, platform: "instacart",
          date: r.date ?? r.report_date,
          campaign_id: r.campaign_id ?? null,
          campaign_name: r.campaign_name ?? null,
          ad_group_id: r.ad_group_id ?? null,
          ad_group_name: r.ad_group_name ?? null,
          creative_id: r.creative_id ?? null,
          creative_name: r.creative_name ?? r.format ?? null,
          placement: r.placement ?? r.surface ?? null,
          geo_region: r.region ?? r.state ?? null,
          hour: r.hour ?? null,
          spend: Number(r.spend ?? r.cost ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          conversions: Math.round(Number(r.attributed_units ?? r.conversions ?? 0)),
          revenue: Number(r.attributed_sales ?? r.revenue ?? 0),
          source: `instacart_api:${p.name}`,
        })).filter(f => f.date);
        const written = await writeFacts(sb, facts);
        summary[p.name] += written;
        total += written;
      } catch (e: any) {
        errors.push(`${p.name} ${w.start}..${w.end}: ${e?.message ?? String(e)}`);
      }
    }
  }

  await sb.from("channel_sync_status").upsert({
    channel_id, last_primary_sync: new Date().toISOString(),
    last_sync_source: "backup_cron", sync_status: errors.length ? "stale" : "fresh",
    error_message: errors.length ? errors.join("; ").slice(0, 500) : null,
  }, { onConflict: "channel_id" });

  return J(200, { ok: true, total, summary, errors, windows: windows.length, days });
});