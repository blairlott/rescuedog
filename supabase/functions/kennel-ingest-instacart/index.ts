// Instacart Ads → ad_performance_facts. Dimensional pull across all 7
// supported placements (display, shoppable display, brand pages, promotions,
// universal, video, search). Best-effort: skips quietly if API responds
// without the dimension; never throws across passes.
// deno-lint-ignore-file no-explicit-any
import { CORS, J, FactRow, isAuthorized, makeAdminClient, writeFacts, ensureChannel } from "../_shared/facts-writer.ts";

const BASE = "https://ads.instacart.com/api/v2";
const TOKEN = Deno.env.get("INSTACART_ADS_API_TOKEN");
const ADV = Deno.env.get("INSTACART_ADS_ADVERTISER_ID");

async function pull(path: string, params: Record<string, string>): Promise<any[]> {
  if (!TOKEN || !ADV) return [];
  const qs = new URLSearchParams({ advertiser_id: ADV, ...params });
  const url = `${BASE}${path}?${qs}`;
  const r = await fetch(url, { headers: { "Authorization": `Bearer ${TOKEN}` } });
  if (!r.ok) return [];
  const b: any = await r.json().catch(() => ({}));
  return b?.data ?? b?.results ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = makeAdminClient();
  if (!(await isAuthorized(req, sb))) return J(401, { error: "unauthorized" });
  if (!TOKEN || !ADV) return J(400, { error: "INSTACART_ADS_API_TOKEN or ADVERTISER_ID missing" });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const days = Math.max(1, Math.min(Number(body.days ?? 30), 180));
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

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
    try {
      const rows = await pull(p.path, { start_date: start, end_date: end });
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
      summary[p.name] = written;
      total += written;
    } catch (e: any) {
      errors.push(`${p.name}: ${e?.message ?? String(e)}`);
    }
  }

  await sb.from("channel_sync_status").upsert({
    channel_id, last_primary_sync: new Date().toISOString(),
    last_sync_source: "backup_cron", sync_status: errors.length ? "stale" : "fresh",
    error_message: errors.length ? errors.join("; ").slice(0, 500) : null,
  }, { onConflict: "channel_id" });

  return J(200, { ok: true, total, summary, errors });
});