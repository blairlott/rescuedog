// Instacart autopilot — picks high-confidence pending recommendations and
// executes them via instacart-ads-execute, respecting daily cap, bid-change
// cap, and the allowed-actions whitelist from app_settings.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function getNum(v: any, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = !!cronSecret && cronSecret === Deno.env.get("KENNEL_INGEST_SECRET");
    const auth = req.headers.get("Authorization") ?? "";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    if (!isCron) {
      if (!auth.startsWith("Bearer ")) return J(401, { error: "Unauthorized" });
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data: claims } = await sb.auth.getClaims(auth.replace("Bearer ", ""));
      if (!claims?.claims?.sub) return J(401, { error: "Unauthorized" });
      const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", claims.claims.sub);
      if (!(roles ?? []).some((r: any) => ["owner", "admin", "ad_ops_manager"].includes(r.role))) {
        return J(403, { error: "Forbidden" });
      }
    }

    // Load settings.
    const { data: settings } = await admin.from("app_settings").select("key,value")
      .in("key", [
        "instacart_autopilot_enabled",
        "instacart_autopilot_confidence_min",
        "instacart_autopilot_max_bid_change_pct",
        "instacart_autopilot_daily_action_cap",
        "instacart_autopilot_allowed_actions",
        "instacart_autopilot_negative_category_allowlist",
        "instacart_autopilot_max_error_rate_pct",
        "instacart_autopilot_error_rate_window",
        "instacart_autopilot_min_roas",
        "instacart_autopilot_roas_window_days",
        "instacart_autopilot_min_actions_for_eval",
      ]);
    const cfg: Record<string, any> = {};
    (settings ?? []).forEach((r: any) => { cfg[r.key] = r.value; });

    const enabled = cfg.instacart_autopilot_enabled === true;
    const minConf = getNum(cfg.instacart_autopilot_confidence_min, 0.75);
    const maxBidPct = getNum(cfg.instacart_autopilot_max_bid_change_pct, 25);
    const dailyCap = getNum(cfg.instacart_autopilot_daily_action_cap, 20);
    const allowed: string[] = Array.isArray(cfg.instacart_autopilot_allowed_actions)
      ? cfg.instacart_autopilot_allowed_actions
      : ["raise_bid", "lower_bid", "pause", "add_negative"];
    const negativeAllowlist: string[] = (Array.isArray(cfg.instacart_autopilot_negative_category_allowlist)
      ? cfg.instacart_autopilot_negative_category_allowlist
      : []).map((s: any) => String(s).toLowerCase().trim()).filter(Boolean);
    const maxErrorRatePct = getNum(cfg.instacart_autopilot_max_error_rate_pct, 25);
    const errorWindow = Math.max(5, getNum(cfg.instacart_autopilot_error_rate_window, 50));
    const minRoas = getNum(cfg.instacart_autopilot_min_roas, 1.5);
    const roasWindowDays = Math.max(1, getNum(cfg.instacart_autopilot_roas_window_days, 7));
    const minActionsForEval = Math.max(1, getNum(cfg.instacart_autopilot_min_actions_for_eval, 10));

    if (!enabled) {
      return J(200, { ok: true, skipped: "autopilot_disabled" });
    }

    // Helper: trip the kill switch and record reason.
    const autoStop = async (reason: string, detail: Record<string, unknown>) => {
      await admin.from("app_settings").upsert([
        { key: "instacart_autopilot_enabled", value: false },
        { key: "instacart_autopilot_auto_stopped_at", value: new Date().toISOString() },
        { key: "instacart_autopilot_auto_stopped_reason", value: { reason, ...detail } },
      ], { onConflict: "key" });
      console.warn("instacart-autopilot auto-stop", reason, detail);
    };

    // Auto-stop #1: error rate over the last N autopilot actions.
    const { data: recentExec } = await admin.from("ad_execution_log")
      .select("success")
      .eq("platform", "instacart")
      .eq("executor", "autopilot")
      .order("created_at", { ascending: false })
      .limit(errorWindow);
    const sample = recentExec ?? [];
    if (sample.length >= minActionsForEval) {
      const failures = sample.filter((r: any) => r.success === false).length;
      const errPct = (failures / sample.length) * 100;
      if (errPct > maxErrorRatePct) {
        await autoStop("error_rate_exceeded", {
          error_pct: Number(errPct.toFixed(2)),
          threshold_pct: maxErrorRatePct,
          window: sample.length,
          failures,
        });
        return J(200, { ok: true, auto_stopped: "error_rate_exceeded", error_pct: errPct, failures, window: sample.length });
      }
    }

    // Auto-stop #2: ROAS over the trailing window dropped below threshold.
    const sinceRoas = new Date(Date.now() - roasWindowDays * 86400_000).toISOString();
    const { data: campMetrics } = await admin.from("ad_campaigns")
      .select("spend_mtd_cents,sales_mtd_cents,last_synced_at")
      .eq("platform_slug", "instacart")
      .gte("last_synced_at", sinceRoas);
    const spend = (campMetrics ?? []).reduce((s: number, r: any) => s + (Number(r.spend_mtd_cents) || 0), 0);
    const sales = (campMetrics ?? []).reduce((s: number, r: any) => s + (Number(r.sales_mtd_cents) || 0), 0);
    if (spend >= 10_000) { // require $100+ trailing spend before evaluating
      const roas = sales / spend;
      if (roas < minRoas) {
        await autoStop("roas_below_threshold", {
          roas: Number(roas.toFixed(3)),
          min_roas: minRoas,
          window_days: roasWindowDays,
          spend_cents: spend,
          sales_cents: sales,
        });
        return J(200, { ok: true, auto_stopped: "roas_below_threshold", roas, min_roas: minRoas, spend_cents: spend, sales_cents: sales });
      }
    }

    // Daily cap check.
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const { count: executedToday } = await admin.from("ad_execution_log")
      .select("id", { count: "exact", head: true })
      .eq("platform", "instacart")
      .eq("executor", "autopilot")
      .eq("success", true)
      .gte("created_at", since.toISOString());
    const budget = Math.max(0, dailyCap - (executedToday ?? 0));
    if (budget === 0) return J(200, { ok: true, skipped: "daily_cap_reached", executed_today: executedToday });

    // Pull eligible pending Instacart recommendations.
    const { data: recs } = await admin.from("ad_recommendations")
      .select("*")
      .eq("status", "pending")
      .gte("confidence", minConf)
      .order("projected_impact_cents", { ascending: false })
      .limit(50);

    const candidates = (recs ?? []).filter((r: any) => {
      const p = r.payload ?? {};
      if (p.platform && p.platform !== "instacart") return false;
      if (!p.platform && !/instacart/i.test(r.title ?? "")) return false;
      if (!allowed.includes(p.action)) return false;
      return true;
    }).slice(0, budget);

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/instacart-ads-execute`;
    const results: any[] = [];
    for (const rec of candidates) {
      const p = rec.payload ?? {};
      let body: any = null;

      if (p.action === "raise_bid" || p.action === "lower_bid") {
        const cur = Number(p.current_bid_cents ?? 0);
        const sug = Number(p.suggested_bid_cents ?? 0);
        if (!cur || !sug) { results.push({ id: rec.id, skipped: "missing_bid" }); continue; }
        const pctChange = Math.abs((sug - cur) / cur) * 100;
        if (pctChange > maxBidPct) {
          results.push({ id: rec.id, skipped: `bid_change_${pctChange.toFixed(1)}pct_exceeds_cap_${maxBidPct}pct` });
          continue;
        }
        // Resolve the local keyword id by (platform, keyword, match_type).
        const { data: kw } = await admin.from("ad_keywords")
          .select("id, campaign_id").eq("platform_slug", "instacart").eq("keyword", p.keyword)
          .eq("match_type", String(p.match_type ?? "broad").toLowerCase()).maybeSingle();
        if (!kw) { results.push({ id: rec.id, skipped: "keyword_not_found" }); continue; }
        // Guardrail: never change bids on paused campaigns.
        if (kw.campaign_id) {
          const { data: camp } = await admin.from("ad_campaigns")
            .select("status").eq("id", kw.campaign_id).maybeSingle();
          const st = String(camp?.status ?? "").toLowerCase();
          if (st === "paused" || st === "disabled" || st === "archived") {
            results.push({ id: rec.id, skipped: `campaign_${st}_bid_change_blocked` });
            continue;
          }
        }
        body = { action: "set_keyword_bid", keyword_id: kw.id, bid_cents: sug, recommendation_id: rec.id };
      } else if (p.action === "pause") {
        const { data: kw } = await admin.from("ad_keywords")
          .select("id, campaign_id").eq("platform_slug", "instacart").eq("keyword", p.keyword)
          .eq("match_type", String(p.match_type ?? "broad").toLowerCase()).maybeSingle();
        if (!kw) { results.push({ id: rec.id, skipped: "keyword_not_found" }); continue; }
        if (kw.campaign_id) {
          const { data: camp } = await admin.from("ad_campaigns")
            .select("status").eq("id", kw.campaign_id).maybeSingle();
          const st = String(camp?.status ?? "").toLowerCase();
          if (st === "paused" || st === "disabled" || st === "archived") {
            results.push({ id: rec.id, skipped: `campaign_${st}_pause_blocked` });
            continue;
          }
        }
        body = { action: "pause_keyword", keyword_id: kw.id, recommendation_id: rec.id };
      } else if (p.action === "add_negative") {
        // Need a campaign_id on the payload; otherwise skip.
        if (!p.campaign_external_id) { results.push({ id: rec.id, skipped: "no_campaign" }); continue; }
        const { data: c } = await admin.from("ad_campaigns")
          .select("id, status, objective, metadata").eq("platform_slug", "instacart").eq("external_id", p.campaign_external_id).maybeSingle();
        if (!c) { results.push({ id: rec.id, skipped: "campaign_not_found" }); continue; }
        // Guardrail: category allowlist for negative keywords.
        const category = String(
          (c as any).metadata?.category ??
          (c as any).metadata?.product_category ??
          (c as any).objective ?? "",
        ).toLowerCase().trim();
        if (negativeAllowlist.length === 0) {
          results.push({ id: rec.id, skipped: "negative_allowlist_empty" });
          continue;
        }
        if (!category || !negativeAllowlist.includes(category)) {
          results.push({ id: rec.id, skipped: `category_${category || "unknown"}_not_in_negative_allowlist` });
          continue;
        }
        body = {
          action: "add_negative_keyword", campaign_id: c.id,
          keyword: p.keyword, match_type: p.match_type ?? "phrase",
          recommendation_id: rec.id,
        };
      } else {
        results.push({ id: rec.id, skipped: `unsupported_action_${p.action}` });
        continue;
      }

      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": Deno.env.get("KENNEL_INGEST_SECRET") ?? "",
        },
        body: JSON.stringify(body),
      });
      const txt = await r.text().catch(() => "");
      results.push({ id: rec.id, status: r.status, body: txt.slice(0, 200) });
    }

    return J(200, {
      ok: true,
      considered: (recs ?? []).length,
      eligible: candidates.length,
      executed_today_before: executedToday,
      budget,
      results,
    });
  } catch (e: any) {
    console.error("instacart-autopilot error", e);
    return J(500, { error: e?.message ?? "Server error" });
  }
});