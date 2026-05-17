// Historical backfill for ad_performance_daily across Meta + Google + Instacart.
// Pulls channel-level daily rollups for a configurable window and upserts into
// ad_performance_daily so the Command Center reflects real history.
// Auth: requires admin/owner/ad_ops via JWT.
// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function authorized(req: Request, sb: SupabaseClient): Promise<boolean> {
  if (req.headers.get("apikey") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return false;
  const { data: a } = await sb.rpc("is_admin_or_owner", { _user_id: user.id });
  if (a) return true;
  const { data: b } = await sb.rpc("is_ad_ops", { _user_id: user.id });
  return !!b;
}

type DailyRow = {
  channel_id: string; date: string;
  spend: number; impressions: number; clicks: number; conversions: number; revenue: number;
};

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }

// ───────────────────────── META ─────────────────────────
async function metaBackfill(channel_id: string, since: string, until: string): Promise<DailyRow[]> {
  const TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN");
  const ACCOUNT = Deno.env.get("META_ADS_ACCOUNT_ID");
  if (!TOKEN || !ACCOUNT) throw new Error("META credentials missing");

  const fields = ["spend", "impressions", "clicks", "actions", "action_values", "date_start"].join(",");
  const qs = new URLSearchParams({
    access_token: TOKEN,
    level: "account",
    fields,
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  });
  const out: DailyRow[] = [];
  let next: string | null = `https://graph.facebook.com/v21.0/act_${ACCOUNT}/insights?${qs}`;
  let pages = 0;
  while (next && pages < 50) {
    const r = await fetch(next);
    const b: any = await r.json().catch(() => ({}));
    if (!r.ok || b?.error) throw new Error(b?.error?.message ?? `meta HTTP ${r.status}`);
    for (const row of (b.data ?? [])) {
      const purchases = (row.actions ?? []).filter((a: any) =>
        a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase",
      ).reduce((s: number, a: any) => s + Number(a.value ?? 0), 0);
      const revenue = (row.action_values ?? []).filter((a: any) => a.action_type === "purchase")
        .reduce((s: number, a: any) => s + Number(a.value ?? 0), 0);
      out.push({
        channel_id, date: row.date_start,
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        conversions: Math.round(purchases),
        revenue,
      });
    }
    next = b.paging?.next ?? null;
    pages += 1;
  }
  return out;
}

// ───────────────────────── GOOGLE ─────────────────────────
async function googleToken(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("GOOGLE_ADS_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN")!,
    }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`google token HTTP ${r.status}: ${JSON.stringify(b)}`);
  return b.access_token as string;
}

async function googleBackfill(channel_id: string, since: string, until: string): Promise<DailyRow[]> {
  const CUST = (Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "").replace(/-/g, "");
  const LOGIN = (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replace(/-/g, "");
  const DEV = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!CUST || !DEV) throw new Error("Google Ads credentials missing");
  const token = await googleToken();
  const query = `
    SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.conversions, metrics.conversions_value
    FROM customer
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `;
  const r = await fetch(`https://googleads.googleapis.com/v21/customers/${CUST}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "developer-token": DEV,
      ...(LOGIN ? { "login-customer-id": LOGIN } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`gaql HTTP ${r.status}: ${JSON.stringify(b)}`);
  const byDate = new Map<string, DailyRow>();
  const chunks = Array.isArray(b) ? b : [b];
  for (const chunk of chunks) for (const row of (chunk.results ?? [])) {
    const d = row.segments?.date as string;
    if (!d) continue;
    const cur = byDate.get(d) ?? { channel_id, date: d, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
    cur.spend += Number(row.metrics?.costMicros ?? 0) / 1_000_000;
    cur.impressions += Number(row.metrics?.impressions ?? 0);
    cur.clicks += Number(row.metrics?.clicks ?? 0);
    cur.conversions += Math.round(Number(row.metrics?.conversions ?? 0));
    cur.revenue += Number(row.metrics?.conversionsValue ?? 0);
    byDate.set(d, cur);
  }
  return [...byDate.values()];
}

// ───────────────────────── INSTACART ─────────────────────────
// Best-effort: skipped if credentials missing or API unreachable. Returns []
// rather than throwing so a partial backfill still succeeds for Meta/Google.
async function instacartBackfill(channel_id: string, since: string, until: string): Promise<DailyRow[]> {
  const TOKEN = Deno.env.get("INSTACART_ADS_API_TOKEN");
  const ADV = Deno.env.get("INSTACART_ADS_ADVERTISER_ID");
  if (!TOKEN || !ADV) return [];
  try {
    const url = `https://ads.instacart.com/api/v2/reports/daily?advertiser_id=${ADV}&start_date=${since}&end_date=${until}`;
    const r = await fetch(url, { headers: { "Authorization": `Bearer ${TOKEN}` } });
    if (!r.ok) return [];
    const b: any = await r.json().catch(() => ({}));
    const rows: any[] = b?.data ?? b?.results ?? [];
    return rows.map((row): DailyRow => ({
      channel_id, date: row.date ?? row.report_date,
      spend: Number(row.spend ?? row.cost ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      conversions: Math.round(Number(row.attributed_units ?? row.conversions ?? 0)),
      revenue: Number(row.attributed_sales ?? row.revenue ?? 0),
    })).filter(r => r.date);
  } catch { return []; }
}

async function writeDaily(sb: SupabaseClient, rows: DailyRow[]): Promise<number> {
  if (!rows.length) return 0;
  const out: any[] = rows
    .filter(r => r.date)
    .map(r => ({ ...r, source: "backup_cron", ingest_request_id: `backfill:${r.channel_id}:${r.date}` }));
  let total = 0;
  for (let i = 0; i < out.length; i += 500) {
    const chunk = out.slice(i, i + 500);
    const { error, data } = await sb.from("ad_performance_daily")
      .upsert(chunk, { onConflict: "channel_id,date" }).select("id");
    if (error) throw error;
    total += data?.length ?? 0;
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = admin();
  if (!(await authorized(req, sb))) return J(401, { error: "unauthorized" });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const days = Math.max(1, Math.min(Number(body.days ?? 365), 730));
  const until = isoDay(new Date());
  const since = body.since ?? isoDay(new Date(Date.now() - days * 86400000));

  const { data: channels } = await sb.from("ad_channels").select("id, platform");
  const map = new Map((channels ?? []).map((c: any) => [c.platform, c.id]));

  const result: Record<string, any> = { since, until, platforms: {} };

  for (const [platform, fn] of [
    ["meta", metaBackfill] as const,
    ["google", googleBackfill] as const,
    ["instacart", instacartBackfill] as const,
  ]) {
    const cid = map.get(platform);
    if (!cid) { result.platforms[platform] = { skipped: "channel not found" }; continue; }
    try {
      const rows = await fn(cid, since, until);
      const upserted = await writeDaily(sb, rows);
      result.platforms[platform] = { rows: rows.length, upserted };
      await sb.from("channel_sync_status").upsert(
        {
          channel_id: cid,
          last_primary_sync: new Date().toISOString(),
          last_sync_source: "backup_cron",
          sync_status: "fresh",
        },
        { onConflict: "channel_id" },
      );
    } catch (e: any) {
      result.platforms[platform] = { error: e?.message ?? String(e) };
    }
  }

  return J(200, result);
});