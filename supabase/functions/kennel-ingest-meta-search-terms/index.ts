// Meta search-term ingest → ad_search_terms (platform_slug='meta').
// Meta has no traditional keywords; ASC/Shopping campaigns expose user search
// queries via the `search_query` insights breakdown. Some accounts/campaigns
// won't return any data — that's fine, we record 0 rows.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kennel-ingest-secret",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const VER = "v21.0";
const TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN");
const ACCOUNT = (Deno.env.get("META_ADS_ACCOUNT_ID") ?? "").replace(/^act_/, "");

async function insights(days: number) {
  if (!TOKEN || !ACCOUNT) throw new Error("META_ADS_ACCESS_TOKEN or META_ADS_ACCOUNT_ID missing");
  const fields = ["campaign_id", "campaign_name", "spend", "impressions", "clicks", "actions", "action_values"].join(",");
  const qs = new URLSearchParams({
    access_token: TOKEN,
    level: "campaign",
    fields,
    date_preset: days <= 7 ? "last_7d" : days <= 30 ? "last_30d" : "last_90d",
    breakdowns: "search_query",
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

function purchaseStats(actions?: any[], action_values?: any[]) {
  let conv = 0, rev = 0;
  for (const a of actions ?? []) {
    if (a?.action_type === "purchase" || a?.action_type === "offsite_conversion.fb_pixel_purchase") {
      conv += Number(a.value ?? 0);
    }
  }
  for (const a of action_values ?? []) {
    if (a?.action_type === "purchase" || a?.action_type === "offsite_conversion.fb_pixel_purchase") {
      rev += Number(a.value ?? 0);
    }
  }
  return { conv: Math.round(conv), rev_cents: Math.round(rev * 100) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth
  const secret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  const headerSecret = req.headers.get("x-kennel-ingest-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const isService = auth === `Bearer ${SERVICE_KEY}`;
  const hasSecret = secret && headerSecret === secret;
  let isAdOps = false;
  if (!isService && !hasSecret && auth.startsWith("Bearer ")) {
    const tokStr = auth.slice(7);
    const { data: userRes } = await sb.auth.getUser(tokStr);
    const uid = userRes?.user?.id;
    if (uid) {
      const { data: ok } = await sb.rpc("is_ad_ops", { _user_id: uid });
      isAdOps = !!ok;
    }
  }
  if (!isService && !hasSecret && !isAdOps) return J(401, { error: "unauthorized" });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (body?.dry_run === true || body?.probe === true) {
    return J(200, { ok: true, dry_run: true, function: "kennel-ingest-meta-search-terms" });
  }

  const days = Math.min(Math.max(Number(body?.days ?? 30), 1), 90);
  let inserted = 0;
  const errors: string[] = [];

  try {
    const rows = await insights(days);
    const agg = new Map<string, any>();
    for (const r of rows) {
      const q = r.search_query;
      if (!q || typeof q !== "string") continue;
      const key = `${r.campaign_id ?? ""}::${q}`;
      const stats = purchaseStats(r.actions, r.action_values);
      const cur = agg.get(key) ?? {
        platform_slug: "meta",
        query: q,
        impressions: 0,
        clicks: 0,
        spend_cents: 0,
        conversions: 0,
        sales_cents: 0,
        metadata: {
          campaign_id: r.campaign_id ?? null,
          campaign_name: r.campaign_name ?? null,
          window_days: days,
        },
      };
      cur.impressions += Number(r.impressions ?? 0);
      cur.clicks += Number(r.clicks ?? 0);
      cur.spend_cents += Math.round(Number(r.spend ?? 0) * 100);
      cur.conversions += stats.conv;
      cur.sales_cents += stats.rev_cents;
      agg.set(key, cur);
    }
    // Replace recent unresolved Meta search terms
    await sb.from("ad_search_terms")
      .delete()
      .eq("platform_slug", "meta")
      .is("resolved_at", null);
    const payload = Array.from(agg.values());
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error } = await sb.from("ad_search_terms").insert(chunk);
      if (error) throw new Error(error.message);
      inserted += chunk.length;
    }
  } catch (e: any) {
    errors.push(String(e?.message ?? e));
  }

  return J(errors.length ? 207 : 200, {
    ok: errors.length === 0,
    function: "kennel-ingest-meta-search-terms",
    days,
    search_terms_inserted: inserted,
    note: inserted === 0 && !errors.length
      ? "No search-query breakdown returned. Meta only exposes this for ASC/Shopping campaigns with enough volume."
      : undefined,
    errors,
  });
});