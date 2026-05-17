// Meta Insights → ad_performance_facts. Pulls campaign + adset + ad with
// placement / age / gender / region / device breakdowns.
// deno-lint-ignore-file no-explicit-any
import { CORS, J, FactRow, isAuthorized, makeAdminClient, writeFacts, ensureChannel } from "../_shared/facts-writer.ts";

const VER = "v21.0";
const TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN");
const ACCOUNT = Deno.env.get("META_ADS_ACCOUNT_ID");

async function insights(level: "campaign" | "adset" | "ad", breakdown: string, days: number) {
  const fields = [
    "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
    "spend", "impressions", "clicks", "actions", "action_values", "date_start",
  ].join(",");
  const qs = new URLSearchParams({
    access_token: TOKEN!,
    level,
    fields,
    time_increment: "1",
    date_preset: days <= 7 ? "last_7d" : days <= 30 ? "last_30d" : "last_90d",
    breakdowns: breakdown,
    limit: "500",
  });
  const url = `https://graph.facebook.com/${VER}/act_${ACCOUNT}/insights?${qs}`;
  const out: any[] = [];
  let next: string | null = url;
  let pages = 0;
  while (next && pages < 8) {
    const r = await fetch(next);
    const b: any = await r.json().catch(() => ({}));
    if (!r.ok || b?.error) throw new Error(b?.error?.message ?? `meta insights HTTP ${r.status}`);
    out.push(...(b.data ?? []));
    next = b.paging?.next ?? null;
    pages += 1;
  }
  return out;
}

function conv(actions: any[] | undefined): { conv: number; rev: number } {
  if (!actions) return { conv: 0, rev: 0 };
  let conv = 0, rev = 0;
  for (const a of actions) {
    if (typeof a?.value !== "string" && typeof a?.value !== "number") continue;
    const v = Number(a.value);
    if (a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase") conv += v;
    if (a.action_type === "purchase" && typeof a.value === "string" && !isNaN(Number(a.value))) {
      // value here is count; revenue comes via action_values separately
    }
  }
  return { conv, rev };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = makeAdminClient();
  if (!(await isAuthorized(req, sb))) return J(401, { error: "unauthorized" });
  if (!TOKEN || !ACCOUNT) return J(400, { error: "META_ADS_ACCESS_TOKEN or META_ADS_ACCOUNT_ID missing" });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const days = Number(body.days ?? 30);

  const channel_id = await ensureChannel(sb, "meta");
  if (!channel_id) return J(500, { error: "no meta channel row" });

  const passes: { breakdown: string; cols: Partial<FactRow> }[] = [
    { breakdown: "publisher_platform,platform_position", cols: {} },
    { breakdown: "age,gender", cols: {} },
    { breakdown: "region", cols: {} },
    { breakdown: "device_platform", cols: {} },
  ];

  let total = 0;
  const errors: string[] = [];
  for (const p of passes) {
    try {
      const rows = await insights("ad", p.breakdown, days);
      const facts: FactRow[] = rows.map((r): FactRow => {
        const av = (r.action_values ?? []).find((x: any) => x.action_type === "purchase");
        const purchases = conv(r.actions).conv;
        return {
          channel_id, platform: "meta", date: r.date_start,
          campaign_id: r.campaign_id, campaign_name: r.campaign_name,
          ad_group_id: r.adset_id, ad_group_name: r.adset_name,
          ad_id: r.ad_id, ad_name: r.ad_name,
          placement: [r.publisher_platform, r.platform_position].filter(Boolean).join(":") || null,
          audience_id: [r.age, r.gender].filter(Boolean).join(":") || null,
          audience_name: [r.age, r.gender].filter(Boolean).join(":") || null,
          geo_region: r.region ?? null,
          device: r.device_platform ?? null,
          spend: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          conversions: purchases,
          revenue: av ? Number(av.value ?? 0) : 0,
          source: "meta_insights",
        };
      });
      total += await writeFacts(sb, facts);
    } catch (e: any) {
      errors.push(`${p.breakdown}: ${e?.message ?? e}`);
    }
  }
  return J(200, { ok: true, rows: total, errors });
});