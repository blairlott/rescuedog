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

/** Fetch Instacart performance report (best-effort, schema-tolerant). */
async function fetchInstacartReport(
  token: string,
  advertiserId: string,
  level: "ad_group" | "ad_group_product",
  lookbackDays: number,
): Promise<{ ok: true; rows: any[] } | { ok: false; error: string }> {
  const endDate = isoDateOffset(0);
  const startDate = isoDateOffset(lookbackDays);
  // Instacart Ads v3 reporting — best-effort URL; if your account uses a
  // different report path, this returns empty rows gracefully.
  const url = `${INSTACART_BASE}/reports?advertiser_id=${advertiserId}&level=${level}&start_date=${startDate}&end_date=${endDate}&granularity=total`;
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

  // --- Ad-group level: budget pacing ---
  if (s.budget_pacing_enabled) {
    const rep = await fetchInstacartReport(tk.token, advertiserId, "ad_group", s.lookback_days);
    if (!rep.ok) {
      summary.notes.push(`ad_group report failed: ${rep.error}`);
    } else {
      const rows = rep.rows.map(normalizeRow).filter(r => r.entity_id && r.spend_cents > 0);
      // Group by campaign — fetch ad groups so we know campaign mapping + current budgets.
      const agRes = await fetch(`${INSTACART_BASE}/ad_groups?advertiser_id=${advertiserId}&limit=200`, {
        headers: { Authorization: `Bearer ${tk.token}`, "Instacart-Ads-Advertiser-Id": advertiserId },
      });
      const agBody = await agRes.json().catch(() => ({}));
      const adGroups: any[] = agBody?.ad_groups ?? agBody?.data ?? [];
      const agById = new Map(adGroups.map(g => [String(g.id), g]));

      // Group metrics by campaign_id
      const byCampaign = new Map<string, { rows: typeof rows; total_spend: number; total_rev: number }>();
      for (const r of rows) {
        const ag = agById.get(r.entity_id);
        if (!ag) continue;
        const cid = String(ag.campaign_id ?? ag.campaign?.id ?? "");
        if (!cid) continue;
        const bucket = byCampaign.get(cid) ?? { rows: [] as typeof rows, total_spend: 0, total_rev: 0 };
        bucket.rows.push(r);
        bucket.total_spend += r.spend_cents;
        bucket.total_rev += r.revenue_cents;
        byCampaign.set(cid, bucket);
      }

      for (const [cid, bucket] of byCampaign) {
        if (bucket.total_spend < 100) continue; // < $1 spent total, skip
        // For each ad_group, target share = roas * conversions, fall back to spend share.
        const totalScore = bucket.rows.reduce((sum, r) => sum + Math.max(0.0001, r.roas * Math.max(1, r.conversions)), 0);
        if (totalScore <= 0) continue;
        // Sum current daily budgets as the pool to redistribute.
        const pool = bucket.rows.reduce((sum, r) => {
          const ag = agById.get(r.entity_id);
          return sum + Number(ag?.daily_budget_cents ?? 0);
        }, 0);
        if (pool <= 0) continue;

        for (const r of bucket.rows) {
          const ag = agById.get(r.entity_id);
          const current = Number(ag?.daily_budget_cents ?? 0);
          if (current <= 0) continue;
          const score = Math.max(0.0001, r.roas * Math.max(1, r.conversions));
          const ideal = Math.round((score / totalScore) * pool);
          const maxShift = Math.round(current * (s.max_daily_budget_shift_pct / 100));
          let recommended = Math.max(current - maxShift, Math.min(current + maxShift, ideal));
          recommended = Math.max(s.budget_floor_cents, Math.min(s.budget_ceiling_cents, recommended));
          if (Math.abs(recommended - current) < Math.max(100, current * 0.05)) continue; // <5% or <$1: skip noise

          const deltaPct = ((recommended - current) / current) * 100;
          const idem = `${today}|instacart|budget_pacing|adset|${r.entity_id}`;
          const reasoning = `7d ROAS ${r.roas.toFixed(2)}x · spend $${(r.spend_cents/100).toFixed(0)} · rev $${(r.revenue_cents/100).toFixed(0)} · campaign share ${(score/totalScore*100).toFixed(0)}%`;

          const { data: existing } = await admin
            .from("kennel_optimizer_recommendations")
            .select("id").eq("idempotency_key", idem).maybeSingle();
          if (existing) { summary.skipped_existing++; continue; }

          let status = "pending";
          let applyResp: any = null;
          if (s.auto_apply && !dryRun) {
            const result = await patchInstacart(tk.token, advertiserId, `/ad_groups/${r.entity_id}`, { daily_budget_cents: recommended });
            status = result.ok ? "applied" : "failed";
            applyResp = { status: result.status, body: result.body };
            if (result.ok) summary.applied++; else summary.errors++;
          } else { summary.queued++; }

          await admin.from("kennel_optimizer_recommendations").insert({
            platform: "instacart", rule_type: "budget_pacing",
            entity_type: "adset", entity_id: r.entity_id,
            current_value: current, recommended_value: recommended, delta_pct: deltaPct,
            metric_window_days: s.lookback_days,
            spend_cents: r.spend_cents, revenue_cents: r.revenue_cents,
            roas: r.roas, clicks: r.clicks, conversions: r.conversions,
            reasoning, status,
            applied_at: status === "applied" ? new Date().toISOString() : null,
            apply_response: applyResp,
            idempotency_key: idem,
          });
          summary.budget_recs++;

          if (status === "applied") {
            await admin.from("ad_execution_log").insert({
              action: "optimizer_budget", actor_id: null, actor_kind: "system",
              request_payload: { platform: "instacart", entity_id: r.entity_id, recommended, current },
              response_payload: applyResp, success: true,
            });
          }
        }
      }
    }
  }

  // --- Ad-group-product level: bid opt + auto-pause ---
  if (s.bid_optimization_enabled || s.auto_pause_enabled) {
    const rep = await fetchInstacartReport(tk.token, advertiserId, "ad_group_product", s.lookback_days);
    if (!rep.ok) {
      summary.notes.push(`ad_group_product report failed: ${rep.error}`);
    } else {
      const rows = rep.rows.map(normalizeRow).filter(r => r.entity_id);
      // Cap bid changes per run
      let bidChangesLeft = s.max_daily_bid_changes;

      for (const r of rows) {
        // ---- Auto-pause zero-ROAS ----
        if (s.auto_pause_enabled && r.spend_cents >= s.pause_threshold_cents && r.conversions === 0) {
          const idem = `${today}|instacart|pause_zero_roas|ad|${r.entity_id}`;
          const { data: existing } = await admin
            .from("kennel_optimizer_recommendations")
            .select("id").eq("idempotency_key", idem).maybeSingle();
          if (!existing) {
            let status = "pending"; let applyResp: any = null;
            const reasoning = `Spent $${(r.spend_cents/100).toFixed(2)} over ${s.lookback_days}d with 0 conversions`;
            if (s.auto_apply && !dryRun) {
              const result = await patchInstacart(tk.token, advertiserId, `/ad_group_products/${r.entity_id}`, { status: "paused" });
              status = result.ok ? "applied" : "failed";
              applyResp = { status: result.status, body: result.body };
              if (result.ok) summary.applied++; else summary.errors++;
            } else { summary.queued++; }
            await admin.from("kennel_optimizer_recommendations").insert({
              platform: "instacart", rule_type: "pause_zero_roas",
              entity_type: "ad", entity_id: r.entity_id,
              spend_cents: r.spend_cents, revenue_cents: r.revenue_cents,
              roas: 0, clicks: r.clicks, conversions: 0,
              metric_window_days: s.lookback_days, reasoning, status,
              applied_at: status === "applied" ? new Date().toISOString() : null,
              apply_response: applyResp, idempotency_key: idem,
            });
            summary.pause_recs++;
            continue; // don't also bid-tune a paused product
          }
        }

        // ---- Bid optimization ----
        if (!s.bid_optimization_enabled) continue;
        if (r.clicks < s.min_clicks_for_bid_change) continue;
        if (bidChangesLeft <= 0) continue;

        const raiseThreshold = s.target_roas * (1 + s.bid_raise_gate_pct / 100);
        const lowerThreshold = s.target_roas * (s.bid_lower_gate_pct / 100);

        let ruleType: "bid_raise" | "bid_lower" | null = null;
        let stepPct = 0;
        if (r.roas >= raiseThreshold) { ruleType = "bid_raise"; stepPct = s.bid_raise_step_pct; }
        else if (r.roas <= lowerThreshold && r.spend_cents > 0) { ruleType = "bid_lower"; stepPct = -s.bid_lower_step_pct; }
        if (!ruleType) continue;

        // Fetch current bid
        const pRes = await fetch(`${INSTACART_BASE}/ad_group_products/${r.entity_id}`, {
          headers: { Authorization: `Bearer ${tk.token}`, "Instacart-Ads-Advertiser-Id": advertiserId },
        });
        const pBody = await pRes.json().catch(() => ({}));
        const product = pBody?.ad_group_product ?? pBody?.data ?? pBody;
        const currentBid = Number(product?.bid_override ?? product?.default_bid ?? product?.bid ?? 0);
        if (!Number.isFinite(currentBid) || currentBid <= 0) continue;

        const recommendedBid = Math.max(0.05, Number((currentBid * (1 + stepPct / 100)).toFixed(2)));
        if (Math.abs(recommendedBid - currentBid) < 0.01) continue;

        const idem = `${today}|instacart|${ruleType}|ad|${r.entity_id}`;
        const { data: existing } = await admin
          .from("kennel_optimizer_recommendations")
          .select("id").eq("idempotency_key", idem).maybeSingle();
        if (existing) { summary.skipped_existing++; continue; }

        const reasoning = `${s.lookback_days}d ROAS ${r.roas.toFixed(2)}x vs target ${s.target_roas.toFixed(2)}x · ${r.clicks} clicks`;
        let status = "pending"; let applyResp: any = null;
        if (s.auto_apply && !dryRun) {
          const result = await patchInstacart(tk.token, advertiserId, `/ad_group_products/${r.entity_id}`, { bid_override: recommendedBid });
          status = result.ok ? "applied" : "failed";
          applyResp = { status: result.status, body: result.body };
          if (result.ok) { summary.applied++; bidChangesLeft--; } else summary.errors++;
        } else { summary.queued++; bidChangesLeft--; }

        await admin.from("kennel_optimizer_recommendations").insert({
          platform: "instacart", rule_type: ruleType,
          entity_type: "ad", entity_id: r.entity_id,
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
    }
  }

  return json({ ok: true, platform, dry_run: dryRun, summary });
});