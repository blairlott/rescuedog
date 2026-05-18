// Kennel Optimizer — programmatic budget pacing, bid optimization, and
// auto-pause for Instacart Ads (extensible to other platforms).
// Cron-driven. Idempotent per (date + entity + rule) via idempotency_key.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const INSTACART_BASE = "https://api.ads.instacart.com/api/v3";
const INSTACART_TOKEN_URL = "https://api.ads.instacart.com/oauth/token";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function instacartAccessToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const clientId = Deno.env.get("INSTACART_ADS_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("INSTACART_ADS_CLIENT_SECRET")?.trim();
  const refreshToken = Deno.env.get("INSTACART_ADS_REFRESH_TOKEN")?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, error: "Instacart credentials missing" };
  }
  const res = await fetch(INSTACART_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok || !b?.access_token) return { ok: false, error: b?.error_description ?? `HTTP ${res.status}` };
  return { ok: true, token: b.access_token as string };
}

type Settings = {
  platform: string;
  engine_enabled: boolean;
  auto_apply: boolean;
  budget_pacing_enabled: boolean;
  bid_optimization_enabled: boolean;
  auto_pause_enabled: boolean;
  target_roas: number;
  pause_threshold_cents: number;
  pause_zero_conv_days: number;
  bid_raise_gate_pct: number;
  bid_raise_step_pct: number;
  bid_lower_step_pct: number;
  bid_lower_gate_pct: number;
  max_daily_bid_changes: number;
  max_daily_budget_shift_pct: number;
  budget_floor_cents: number;
  budget_ceiling_cents: number;
  lookback_days: number;
  min_clicks_for_bid_change: number;
};

function isoDateOffset(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Fire-and-forget alert dispatch
async function fireAlert(body: Record<string, unknown>) {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/kennel-alert-dispatch`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify(body),
    });
  } catch (_) { /* non-fatal */ }
}

/** Fetch Instacart performance report at campaign level (best-effort, schema-tolerant). */
async function fetchInstacartReport(
  token: string,
  advertiserId: string,
  lookbackDays: number,
): Promise<{ ok: true; rows: any[] } | { ok: false; error: string }> {
  const endDate = isoDateOffset(0);
  const startDate = isoDateOffset(lookbackDays);
  const url = `${INSTACART_BASE}/reports?advertiser_id=${advertiserId}&level=campaign&start_date=${startDate}&end_date=${endDate}&granularity=total`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Instacart-Ads-Advertiser-Id": advertiserId,
    },
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: b?.error?.message ?? `report HTTP ${res.status}` };
  const rows = b?.rows ?? b?.data ?? b?.report ?? b ?? [];
  return { ok: true, rows: Array.isArray(rows) ? rows : [] };
}

/** Fan-out fetch of campaigns across all Instacart ad-format endpoints. */
const IC_FORMAT_SOURCES: Array<{ format: string; path: string; listKeys: string[] }> = [
  { format: "sponsored_product",  path: `/campaigns`,                    listKeys: ["campaigns"] },
  { format: "display",            path: `/display_campaigns`,            listKeys: ["display_campaigns", "campaigns"] },
  { format: "brand_page",         path: `/brand_pages`,                  listKeys: ["brand_pages", "data"] },
  { format: "promotion",          path: `/promotions`,                   listKeys: ["promotions", "coupons", "data"] },
  { format: "universal",          path: `/universal_campaigns`,          listKeys: ["universal_campaigns", "campaigns"] },
  { format: "video",              path: `/video_campaigns`,              listKeys: ["video_campaigns", "campaigns"] },
  { format: "inspiration",        path: `/inspiration_campaigns`,        listKeys: ["inspiration_campaigns", "campaigns"] },
];
const PATCH_PATH_BY_FORMAT: Record<string, string> = {
  sponsored_product: "/campaigns",
  display: "/display_campaigns",
  brand_page: "/brand_pages",
  promotion: "/promotions",
  universal: "/universal_campaigns",
  video: "/video_campaigns",
  inspiration: "/inspiration_campaigns",
};

async function fetchInstacartCampaignsAllFormats(token: string, advertiserId: string) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Instacart-Ads-Advertiser-Id": advertiserId,
  };
  const out: Array<{ format: string; entity_id: string; raw: any }> = [];
  for (const src of IC_FORMAT_SOURCES) {
    const res = await fetch(`${INSTACART_BASE}${src.path}?advertiser_id=${advertiserId}&limit=200`, { headers });
    if (!res.ok) continue; // soft-fail; format may not exist on this account
    const b = await res.json().catch(() => ({}));
    let raw: any = null;
    for (const k of src.listKeys) { if (Array.isArray(b?.[k])) { raw = b[k]; break; } }
    if (!Array.isArray(raw)) raw = Array.isArray(b?.data) ? b.data : (Array.isArray(b) ? b : []);
    for (const c of raw) out.push({ format: src.format, entity_id: String(c.id), raw: c });
  }
  return out;
}

/** Normalize a report row into a uniform shape. */
function normalizeRow(row: any) {
  const spend_cents = Math.round(Number(row.spend_cents ?? row.spend ?? row.cost_cents ?? 0));
  const revenue_cents = Math.round(Number(row.attributed_sales_cents ?? row.revenue_cents ?? row.revenue ?? row.attributed_sales ?? 0));
  const clicks = Number(row.clicks ?? 0);
  const impressions = Number(row.impressions ?? 0);
  const conversions = Number(row.attributed_quantities ?? row.conversions ?? row.units_sold ?? 0);
  const roas = spend_cents > 0 ? revenue_cents / spend_cents : 0;
  return {
    entity_id: String(row.ad_group_id ?? row.ad_group_product_id ?? row.id ?? ""),
    spend_cents, revenue_cents, clicks, impressions, conversions, roas,
  };
}

async function patchInstacart(token: string, advertiserId: string, path: string, payload: any) {
  const res = await fetch(`${INSTACART_BASE}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Instacart-Ads-Advertiser-Id": advertiserId,
    },
    body: JSON.stringify(payload),
  });
  const b = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: b };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: allow cron via shared ingest secret OR authenticated ad-ops user.
  const ingestSecret = Deno.env.get("KENNEL_INGEST_SECRET")?.trim();
  const providedSecret = req.headers.get("x-kennel-cron-secret")?.trim();
  const cronAuthorized = !!ingestSecret && providedSecret === ingestSecret;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (!cronAuthorized) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: ok } = await userClient.rpc("is_ad_ops", { _user_id: user.id });
    if (!ok) return json({ error: "forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const platform = String(body?.platform ?? "instacart").toLowerCase();
  const dryRun = body?.dry_run === true;

  if (platform !== "instacart") return json({ error: "only instacart wired right now" }, 400);

  // Settings
  const { data: settingsRow } = await admin
    .from("kennel_keyword_settings")
    .select("*")
    .eq("platform", platform)
    .single();
  if (!settingsRow) return json({ ok: true, skipped: true, reason: "no settings row for platform" });
  const s = settingsRow as unknown as Settings;
  if (!s.engine_enabled) return json({ ok: true, skipped: true, reason: "engine disabled" });

  // Strategy Mix overrides from ad_settings. Per-platform key takes precedence over global.
  const stratKeys = [`strategy_mode_${platform}`, "strategy_mode"];
  const { data: stratRows } = await admin
    .from("ad_settings")
    .select("key, value")
    .in("key", stratKeys);
  const stratMap = new Map<string, any>((stratRows ?? []).map((r: any) => [r.key, r.value]));
  const strat = stratMap.get(stratKeys[0]) ?? stratMap.get(stratKeys[1]);
  if (strat && typeof strat === "object") {
    const goal = Number(strat.goal ?? 50);
    const risk = Number(strat.risk ?? 50);
    const pace = Number(strat.pace ?? 50);
    // Goal slider → target ROAS floor (max ROAS 4.0x → max reach 1.5x)
    s.target_roas = 4.0 - (goal / 100) * 2.5;
    // Risk slider → max budget swing (10% .. 40%)
    s.max_daily_budget_shift_pct = 10 + (risk / 100) * 30;
    // Pace slider → daily spend cap multiplier (0.8x .. 2.0x of current ceiling)
    s.budget_ceiling_cents = Math.round(s.budget_ceiling_cents * (0.8 + (pace / 100) * 1.2));
    if (typeof strat.auto_apply === "boolean") s.auto_apply = strat.auto_apply;
    summary.notes.push(`strategy_mix: goal=${goal} risk=${risk} pace=${pace} → target_roas=${s.target_roas.toFixed(2)}x, swing=±${s.max_daily_budget_shift_pct.toFixed(0)}%, auto_apply=${s.auto_apply}`);
  }

  const tk = await instacartAccessToken();
  if (!tk.ok) return json({ error: tk.error }, 502);

  const advertiserId = Deno.env.get("INSTACART_ADS_ADVERTISER_ID")?.trim();
  if (!advertiserId) return json({ error: "INSTACART_ADS_ADVERTISER_ID missing" }, 400);

  const today = isoDateOffset(0);
  const summary = {
    budget_recs: 0, bid_recs: 0, pause_recs: 0,
    applied: 0, queued: 0, skipped_existing: 0, errors: 0,
    notes: [] as string[],
  };

  // Flat hierarchy: pace budget / tune bid / auto-pause at CAMPAIGN level,
  // across every ad format (sponsored_product, display, brand_page, etc.).
  const rep = await fetchInstacartReport(tk.token, advertiserId, s.lookback_days);
  if (!rep.ok) {
    summary.notes.push(`campaign report failed: ${rep.error}`);
    return json({ ok: true, platform, dry_run: dryRun, summary });
  }
  const rows = rep.rows.map(normalizeRow).filter(r => r.entity_id);

  // Fetch all campaigns across formats so we know current budget/bid + which
  // endpoint to PATCH for each entity_id.
  const campaigns = await fetchInstacartCampaignsAllFormats(tk.token, advertiserId);
  const campaignById = new Map(campaigns.map(c => [c.entity_id, c]));

  // --- Budget pacing across all campaigns (proportional to roas * conversions) ---
  if (s.budget_pacing_enabled) {
    const eligible = rows.filter(r => campaignById.has(r.entity_id) && Number(campaignById.get(r.entity_id)!.raw?.daily_budget_cents ?? 0) > 0);
    const totalScore = eligible.reduce((sum, r) => sum + Math.max(0.0001, r.roas * Math.max(1, r.conversions)), 0);
    const pool = eligible.reduce((sum, r) => sum + Number(campaignById.get(r.entity_id)!.raw?.daily_budget_cents ?? 0), 0);
    if (totalScore > 0 && pool > 0) {
      for (const r of eligible) {
        const c = campaignById.get(r.entity_id)!;
        const current = Number(c.raw?.daily_budget_cents ?? 0);
        const score = Math.max(0.0001, r.roas * Math.max(1, r.conversions));
        const ideal = Math.round((score / totalScore) * pool);
        const maxShift = Math.round(current * (s.max_daily_budget_shift_pct / 100));
        let recommended = Math.max(current - maxShift, Math.min(current + maxShift, ideal));
        recommended = Math.max(s.budget_floor_cents, Math.min(s.budget_ceiling_cents, recommended));
        if (Math.abs(recommended - current) < Math.max(100, current * 0.05)) continue;

        const deltaPct = ((recommended - current) / current) * 100;
        const idem = `${today}|instacart|budget_pacing|campaign|${c.format}|${r.entity_id}`;
        const reasoning = `${s.lookback_days}d ROAS ${r.roas.toFixed(2)}x · spend $${(r.spend_cents/100).toFixed(0)} · rev $${(r.revenue_cents/100).toFixed(0)} · share ${(score/totalScore*100).toFixed(0)}% · ${c.format}`;

        const { data: existing } = await admin
          .from("kennel_optimizer_recommendations")
          .select("id").eq("idempotency_key", idem).maybeSingle();
        if (existing) { summary.skipped_existing++; continue; }

        let status = "pending"; let applyResp: any = null;
        const patchBase = PATCH_PATH_BY_FORMAT[c.format] ?? "/campaigns";
        if (s.auto_apply && !dryRun) {
          const result = await patchInstacart(tk.token, advertiserId, `${patchBase}/${r.entity_id}`, { daily_budget_cents: recommended });
          status = result.ok ? "applied" : "failed";
          applyResp = { status: result.status, body: result.body };
          if (result.ok) summary.applied++; else summary.errors++;
        } else { summary.queued++; }

        await admin.from("kennel_optimizer_recommendations").insert({
          platform: "instacart", rule_type: "budget_pacing",
          entity_type: "campaign", entity_id: r.entity_id,
          current_value: current, recommended_value: recommended, delta_pct: deltaPct,
          metric_window_days: s.lookback_days,
          spend_cents: r.spend_cents, revenue_cents: r.revenue_cents,
          roas: r.roas, clicks: r.clicks, conversions: r.conversions,
          reasoning, status,
          applied_at: status === "applied" ? new Date().toISOString() : null,
          apply_response: applyResp, idempotency_key: idem,
        });
        summary.budget_recs++;
      }
    }
  }

  // --- Bid optimization + auto-pause (campaign level) ---
  let bidChangesLeft = s.max_daily_bid_changes;
  for (const r of rows) {
    const c = campaignById.get(r.entity_id);
    if (!c) continue;
    const patchBase = PATCH_PATH_BY_FORMAT[c.format] ?? "/campaigns";

    // Auto-pause zero-ROAS
    if (s.auto_pause_enabled && r.spend_cents >= s.pause_threshold_cents && r.conversions === 0) {
      const idem = `${today}|instacart|pause_zero_roas|campaign|${c.format}|${r.entity_id}`;
      const { data: existing } = await admin
        .from("kennel_optimizer_recommendations")
        .select("id").eq("idempotency_key", idem).maybeSingle();
      if (!existing) {
        let status = "pending"; let applyResp: any = null;
        const reasoning = `Spent $${(r.spend_cents/100).toFixed(2)} over ${s.lookback_days}d with 0 conversions · ${c.format}`;
        if (s.auto_apply && !dryRun) {
          const result = await patchInstacart(tk.token, advertiserId, `${patchBase}/${r.entity_id}`, { status: "paused" });
          status = result.ok ? "applied" : "failed";
          applyResp = { status: result.status, body: result.body };
          if (result.ok) summary.applied++; else summary.errors++;
        } else { summary.queued++; }
        await admin.from("kennel_optimizer_recommendations").insert({
          platform: "instacart", rule_type: "pause_zero_roas",
          entity_type: "campaign", entity_id: r.entity_id,
          spend_cents: r.spend_cents, revenue_cents: r.revenue_cents,
          roas: 0, clicks: r.clicks, conversions: 0,
          metric_window_days: s.lookback_days, reasoning, status,
          applied_at: status === "applied" ? new Date().toISOString() : null,
          apply_response: applyResp, idempotency_key: idem,
        });
        summary.pause_recs++;
        continue;
      }
    }

    // Bid optimization (only formats that expose a bid)
    if (!s.bid_optimization_enabled) continue;
    if (r.clicks < s.min_clicks_for_bid_change) continue;
    if (bidChangesLeft <= 0) continue;
    const currentBid = Number(c.raw?.default_bid ?? c.raw?.bid ?? c.raw?.bid_cents / 100 ?? 0);
    if (!Number.isFinite(currentBid) || currentBid <= 0) continue;

    const raiseThreshold = s.target_roas * (1 + s.bid_raise_gate_pct / 100);
    const lowerThreshold = s.target_roas * (s.bid_lower_gate_pct / 100);
    let ruleType: "bid_raise" | "bid_lower" | null = null;
    let stepPct = 0;
    if (r.roas >= raiseThreshold) { ruleType = "bid_raise"; stepPct = s.bid_raise_step_pct; }
    else if (r.roas <= lowerThreshold && r.spend_cents > 0) { ruleType = "bid_lower"; stepPct = -s.bid_lower_step_pct; }
    if (!ruleType) continue;

    const recommendedBid = Math.max(0.05, Number((currentBid * (1 + stepPct / 100)).toFixed(2)));
    if (Math.abs(recommendedBid - currentBid) < 0.01) continue;

    const idem = `${today}|instacart|${ruleType}|campaign|${c.format}|${r.entity_id}`;
    const { data: existing } = await admin
      .from("kennel_optimizer_recommendations")
      .select("id").eq("idempotency_key", idem).maybeSingle();
    if (existing) { summary.skipped_existing++; continue; }

    const reasoning = `${s.lookback_days}d ROAS ${r.roas.toFixed(2)}x vs target ${s.target_roas.toFixed(2)}x · ${r.clicks} clicks · ${c.format}`;
    let status = "pending"; let applyResp: any = null;
    if (s.auto_apply && !dryRun) {
      const result = await patchInstacart(tk.token, advertiserId, `${patchBase}/${r.entity_id}`, { default_bid: recommendedBid });
      status = result.ok ? "applied" : "failed";
      applyResp = { status: result.status, body: result.body };
      if (result.ok) { summary.applied++; bidChangesLeft--; } else summary.errors++;
    } else { summary.queued++; bidChangesLeft--; }

    await admin.from("kennel_optimizer_recommendations").insert({
      platform: "instacart", rule_type: ruleType,
      entity_type: "campaign", entity_id: r.entity_id,
      current_value: currentBid, recommended_value: recommendedBid,
      delta_pct: stepPct,
      metric_window_days: s.lookback_days,
      spend_cents: r.spend_cents, revenue_cents: r.revenue_cents,
      roas: r.roas, clicks: r.clicks, conversions: r.conversions,
      reasoning, status,
      applied_at: status === "applied" ? new Date().toISOString() : null,
      apply_response: applyResp, idempotency_key: idem,
    });
    summary.bid_recs++;
  }

  return json({ ok: true, platform, dry_run: dryRun, summary });
});