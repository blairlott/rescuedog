// Meta autopilot — mirrors instacart-autopilot. Evaluates two kill switches
// (execution error rate + trailing Purchase ROAS) before executing approved
// ad_recommendations for platform='meta'. Logs every evaluation to
// ad_autopilot_kill_switch_evaluations and ad_autopilot_evaluations.
//
// Auto-recovery: when an auto-stop has fired, the pilot self-evaluates on every
// cron tick after cooldown elapses. If both kill switches are healthy on the
// current data, it re-enables itself (clears auto_stopped_at/reason) and
// resumes execution in the same tick. Goal: minimize downtime.
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

    const { data: settings } = await admin.from("app_settings").select("key,value")
      .in("key", [
        "meta_autopilot_enabled",
        "meta_autopilot_confidence_min",
        "meta_autopilot_max_budget_change_pct",
        "meta_autopilot_daily_action_cap",
        "meta_autopilot_allowed_actions",
        "meta_autopilot_max_error_rate_pct",
        "meta_autopilot_error_rate_window",
        "meta_autopilot_min_roas",
        "meta_autopilot_roas_window_days",
        "meta_autopilot_min_actions_for_eval",
        "meta_autopilot_cooldown_minutes",
        "meta_autopilot_notify_emails",
        "meta_autopilot_auto_stopped_at",
      ]);
    const cfg: Record<string, any> = {};
    (settings ?? []).forEach((r: any) => { cfg[r.key] = r.value; });

    const enabledInitial = cfg.meta_autopilot_enabled === true;
    let enabled = enabledInitial;
    const minConf = getNum(cfg.meta_autopilot_confidence_min, 0.75);
    const maxBudgetPct = getNum(cfg.meta_autopilot_max_budget_change_pct, 20);
    const dailyCap = getNum(cfg.meta_autopilot_daily_action_cap, 10);
    const allowed: string[] = Array.isArray(cfg.meta_autopilot_allowed_actions)
      ? cfg.meta_autopilot_allowed_actions
      : ["pause_campaign", "adjust_daily_budget"];
    const maxErrorRatePct = getNum(cfg.meta_autopilot_max_error_rate_pct, 25);
    const errorWindow = Math.max(5, getNum(cfg.meta_autopilot_error_rate_window, 50));
    const minRoas = getNum(cfg.meta_autopilot_min_roas, 2.0);
    const roasWindowDays = Math.max(1, getNum(cfg.meta_autopilot_roas_window_days, 7));
    const minActionsForEval = Math.max(1, getNum(cfg.meta_autopilot_min_actions_for_eval, 10));
    const cooldownMinutes = Math.max(0, getNum(cfg.meta_autopilot_cooldown_minutes, 15));
    const notifyEmails: string[] = Array.isArray(cfg.meta_autopilot_notify_emails)
      ? cfg.meta_autopilot_notify_emails.filter((s: any) => typeof s === "string" && s.includes("@"))
      : [];

    // Cooldown gate: if we were auto-stopped recently, refuse to run until
    // cooldown elapses. Once it elapses we attempt auto-recovery (re-evaluate
    // kill switches and re-enable in-place if healthy).
    let attemptAutoRestart = false;
    if (cfg.meta_autopilot_auto_stopped_at) {
      const stoppedAt = new Date(String(cfg.meta_autopilot_auto_stopped_at)).getTime();
      const cooldownEnds = stoppedAt + cooldownMinutes * 60_000;
      if (Number.isFinite(stoppedAt) && Date.now() < cooldownEnds) {
        return J(200, { ok: true, skipped: "cooldown_active", cooldown_ends_at: new Date(cooldownEnds).toISOString() });
      }
      // Cooldown elapsed — try to recover automatically on this tick.
      attemptAutoRestart = true;
    }

    let evaluatedB2B = 0;
    let autoStopReasonOut: string | null = null;
    let autoStopDetail: Record<string, unknown> = {};
    let executedCount = 0;
    let candidatesConsidered = 0;
    let eligibleCount = 0;
    let budgetAfter = 0;
    let errPctOut: number | null = null;
    let errSampleOut = 0;
    let roasOut: number | null = null;
    let spendOut = 0;
    let salesOut = 0;
    let notificationSent = false;
    let autoRestarted = false;
    let autoRestartReason: string | null = null;
    const killSwitchLog: Array<Record<string, unknown>> = [];

    const logKillSwitch = async (row: {
      switch_name: string;
      status: "ok" | "at_risk" | "tripped" | "skipped";
      measured_value?: number | null;
      threshold?: number | null;
      window_seconds?: number | null;
      sample_size?: number | null;
      failures?: number | null;
      computed_roas?: number | null;
      spend_cents?: number | null;
      sales_cents?: number | null;
      would_trip?: boolean;
      tripped?: boolean;
      detail?: Record<string, unknown>;
    }) => {
      const payload = {
        platform: "meta",
        switch_name: row.switch_name,
        status: row.status,
        measured_value: row.measured_value ?? null,
        threshold: row.threshold ?? null,
        window_seconds: row.window_seconds ?? null,
        sample_size: row.sample_size ?? null,
        failures: row.failures ?? null,
        computed_roas: row.computed_roas ?? null,
        spend_cents: row.spend_cents ?? null,
        sales_cents: row.sales_cents ?? null,
        would_trip: !!row.would_trip,
        tripped: !!row.tripped,
        detail: row.detail ?? {},
      };
      killSwitchLog.push(payload);
      try { await admin.from("ad_autopilot_kill_switch_evaluations").insert(payload); }
      catch (e) { console.warn("meta kill-switch log failed", row.switch_name, e); }
    };

    const writeEvaluation = async (finalEnabled: boolean) => {
      await admin.from("ad_autopilot_evaluations").insert({
        platform: "meta",
        enabled_before: enabledInitial,
        enabled_after: finalEnabled,
        error_pct: errPctOut,
        error_sample: errSampleOut,
        trailing_roas: roasOut,
        trailing_spend_cents: spendOut,
        trailing_sales_cents: salesOut,
        candidates_considered: candidatesConsidered,
        eligible: eligibleCount,
        executed: executedCount,
        budget_remaining: budgetAfter,
        b2b_mode: "include",
        b2b_eligible: evaluatedB2B,
        auto_stopped: !!autoStopReasonOut,
        auto_stop_reason: autoStopReasonOut,
        notification_sent: notificationSent,
        detail: {
          min_conf: minConf,
          max_budget_pct: maxBudgetPct,
          daily_cap: dailyCap,
          cooldown_minutes: cooldownMinutes,
          allowed,
          kill_switches: killSwitchLog,
          auto_restarted: autoRestarted,
          auto_restart_reason: autoRestartReason,
          ...autoStopDetail,
        },
      });
    };

    const sendAutoStopNotification = async (reason: string, detail: Record<string, unknown>) => {
      try {
        const recipients = new Set<string>(notifyEmails);
        if (recipients.size === 0) {
          const { data: admins } = await admin.from("user_roles")
            .select("user_id").in("role", ["owner", "admin", "ad_ops_manager"]);
          const ids = (admins ?? []).map((r: any) => r.user_id).filter(Boolean);
          if (ids.length) {
            const { data: emails } = await admin.from("profiles").select("email").in("id", ids);
            (emails ?? []).forEach((p: any) => { if (p?.email) recipients.add(p.email); });
          }
        }
        const stoppedAt = new Date().toISOString();
        const reasonLabel =
          reason === "error_rate_exceeded" ? "Error rate exceeded threshold" :
          reason === "roas_below_threshold" ? "Trailing Purchase ROAS below threshold" :
          reason;
        const templateData = {
          platform: "Meta",
          reason,
          reasonLabel,
          stoppedAt,
          errorPct: (detail as any).error_pct ?? null,
          errorSample: (detail as any).window ?? null,
          maxErrorPct: (detail as any).threshold_pct ?? null,
          roas: (detail as any).roas ?? null,
          minRoas: (detail as any).min_roas ?? null,
          spendCents: (detail as any).spend_cents ?? null,
          salesCents: (detail as any).sales_cents ?? null,
          windowDays: (detail as any).window_days ?? null,
          detailJson: JSON.stringify(detail, null, 2),
        };
        const idemBase = `meta-autopilot-stop-${reason}-${stoppedAt.slice(0, 16)}`;
        for (const to of recipients) {
          const { error: invokeErr } = await admin.functions.invoke("send-transactional-email", {
            body: {
              templateName: "autopilot-auto-stopped",
              recipientEmail: to,
              idempotencyKey: `${idemBase}-${to}`,
              templateData,
            },
          });
          if (invokeErr) console.warn("meta autopilot notify failed", to, invokeErr);
        }
        notificationSent = recipients.size > 0;
      } catch (e) { console.warn("meta autopilot notification failed", e); }
    };

    if (!enabled && !attemptAutoRestart) {
      await writeEvaluation(false);
      return J(200, { ok: true, skipped: "autopilot_disabled" });
    }

    const autoStop = async (reason: string, detail: Record<string, unknown>) => {
      await admin.from("app_settings").upsert([
        { key: "meta_autopilot_enabled", value: false },
        { key: "meta_autopilot_auto_stopped_at", value: new Date().toISOString() },
        { key: "meta_autopilot_auto_stopped_reason", value: { reason, ...detail } },
      ], { onConflict: "key" });
      console.warn("meta-autopilot auto-stop", reason, detail);
      autoStopReasonOut = reason;
      autoStopDetail = detail;
      await sendAutoStopNotification(reason, detail);
    };

    // Kill switch #1: Meta executor error rate.
    const { data: recentExec } = await admin.from("ad_execution_log")
      .select("success")
      .eq("platform", "meta")
      .eq("executor", "autopilot")
      .order("created_at", { ascending: false })
      .limit(errorWindow);
    const sample = recentExec ?? [];
    errSampleOut = sample.length;
    if (sample.length >= minActionsForEval) {
      const failures = sample.filter((r: any) => r.success === false).length;
      const errPct = (failures / sample.length) * 100;
      errPctOut = Number(errPct.toFixed(2));
      const errStatus: "ok" | "at_risk" | "tripped" =
        errPct > maxErrorRatePct ? "tripped" :
        errPct >= maxErrorRatePct * 0.75 ? "at_risk" : "ok";
      await logKillSwitch({
        switch_name: "error_rate", status: errStatus,
        measured_value: errPctOut, threshold: maxErrorRatePct,
        sample_size: sample.length, failures,
        would_trip: errStatus === "tripped", tripped: errStatus === "tripped",
        detail: { window_size: errorWindow, min_actions_for_eval: minActionsForEval },
      });
      if (errPct > maxErrorRatePct) {
        await autoStop("error_rate_exceeded", {
          error_pct: Number(errPct.toFixed(2)), threshold_pct: maxErrorRatePct,
          window: sample.length, failures,
        });
        await writeEvaluation(false);
        return J(200, { ok: true, auto_stopped: "error_rate_exceeded", error_pct: errPct, failures, window: sample.length });
      }
    } else {
      await logKillSwitch({
        switch_name: "error_rate", status: "skipped",
        sample_size: sample.length, threshold: maxErrorRatePct,
        detail: { reason: "insufficient_sample", min_actions_for_eval: minActionsForEval, window_size: errorWindow },
      });
    }

    // Kill switch #2: trailing Purchase ROAS from ad_performance_facts.
    const sinceRoas = new Date(Date.now() - roasWindowDays * 86400_000).toISOString().slice(0, 10);
    const { data: perf } = await admin.from("ad_performance_facts")
      .select("spend, revenue")
      .eq("platform", "meta")
      .gte("date", sinceRoas)
      .limit(50000);
    const spend = Math.round((perf ?? []).reduce((s: number, r: any) => s + (Number(r.spend) || 0), 0) * 100);
    const sales = Math.round((perf ?? []).reduce((s: number, r: any) => s + (Number(r.revenue) || 0), 0) * 100);
    spendOut = spend; salesOut = sales;
    if (spend >= 10_000) {
      const roas = sales / spend;
      roasOut = Number(roas.toFixed(3));
      const roasStatus: "ok" | "at_risk" | "tripped" =
        roas < minRoas ? "tripped" :
        roas < minRoas * 1.15 ? "at_risk" : "ok";
      await logKillSwitch({
        switch_name: "roas", status: roasStatus,
        measured_value: roasOut, threshold: minRoas,
        window_seconds: roasWindowDays * 86400, computed_roas: roasOut,
        spend_cents: spend, sales_cents: sales,
        would_trip: roasStatus === "tripped", tripped: roasStatus === "tripped",
        detail: { window_days: roasWindowDays, rows: (perf ?? []).length },
      });
      if (roas < minRoas) {
        await autoStop("roas_below_threshold", {
          roas: Number(roas.toFixed(3)), min_roas: minRoas,
          window_days: roasWindowDays, spend_cents: spend, sales_cents: sales,
        });
        await writeEvaluation(false);
        return J(200, { ok: true, auto_stopped: "roas_below_threshold", roas, min_roas: minRoas });
      }
    } else {
      await logKillSwitch({
        switch_name: "roas", status: "skipped",
        threshold: minRoas, window_seconds: roasWindowDays * 86400,
        spend_cents: spend, sales_cents: sales,
        detail: { reason: "insufficient_spend", min_spend_cents: 10_000, window_days: roasWindowDays },
      });
    }

    // Both kill switches are healthy (or skipped for insufficient data).
    // If we got here in auto-restart mode, commit the recovery: flip the
    // enabled flag back on, clear auto-stop markers, and continue executing.
    if (attemptAutoRestart && !enabled) {
      const restartAt = new Date().toISOString();
      await admin.from("app_settings").upsert([
        { key: "meta_autopilot_enabled", value: true },
        { key: "meta_autopilot_auto_stopped_at", value: null },
        { key: "meta_autopilot_auto_stopped_reason", value: null },
        { key: "meta_autopilot_last_auto_restart_at", value: restartAt },
      ], { onConflict: "key" });
      enabled = true;
      autoRestarted = true;
      autoRestartReason = "kill_switches_recovered";
      console.log("meta-autopilot auto-restarted", { restartAt, errPct: errPctOut, roas: roasOut });
    }

    // Daily cap check.
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const { count: executedToday } = await admin.from("ad_execution_log")
      .select("id", { count: "exact", head: true })
      .eq("platform", "meta")
      .eq("executor", "autopilot")
      .eq("success", true)
      .gte("created_at", since.toISOString());
    const budget = Math.max(0, dailyCap - (executedToday ?? 0));
    if (budget === 0) {
      budgetAfter = 0;
      await writeEvaluation(true);
      return J(200, { ok: true, skipped: "daily_cap_reached", executed_today: executedToday });
    }

    // Eligible pending Meta recommendations.
    const { data: recs } = await admin.from("ad_recommendations")
      .select("*")
      .eq("status", "pending")
      .gte("confidence", minConf)
      .order("projected_impact_cents", { ascending: false })
      .limit(50);
    candidatesConsidered = (recs ?? []).length;

    const candidates = (recs ?? []).filter((r: any) => {
      const p = r.payload ?? {};
      if (p.platform && p.platform !== "meta") return false;
      if (!p.platform && !/meta|facebook|instagram/i.test(r.title ?? "")) return false;
      if (!allowed.includes(p.action)) return false;
      return true;
    }).slice(0, budget);
    eligibleCount = candidates.length;
    budgetAfter = budget;

    const execUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-ads-execute`;
    const results: any[] = [];

    for (const rec of candidates) {
      const p = rec.payload ?? {};
      // Resolve campaign by either internal id or external Meta campaign id.
      let campaignId: string | null = null;
      let camp: any = null;
      if (p.campaign_id) {
        const { data: c } = await admin.from("ad_campaigns")
          .select("id, status, daily_budget_cents, metadata, objective")
          .eq("id", p.campaign_id).maybeSingle();
        camp = c; campaignId = c?.id ?? null;
      } else if (p.campaign_external_id) {
        const { data: c } = await admin.from("ad_campaigns")
          .select("id, status, daily_budget_cents, metadata, objective")
          .eq("platform_slug", "meta").eq("external_id", p.campaign_external_id).maybeSingle();
        camp = c; campaignId = c?.id ?? null;
      }
      if (!campaignId) { results.push({ id: rec.id, skipped: "campaign_not_found" }); continue; }

      const status = String(camp?.status ?? "").toLowerCase();
      if (status === "archived") { results.push({ id: rec.id, skipped: "campaign_archived" }); continue; }

      const md = (camp?.metadata ?? {}) as Record<string, unknown>;
      const isB2B = md.b2b === true || /b2b|wholesale|trade/i.test(String(camp?.objective ?? ""));

      let body: any = null;
      if (p.action === "pause_campaign") {
        if (status === "paused") { results.push({ id: rec.id, skipped: "already_paused" }); continue; }
        body = { action: "pause_campaign", campaign_id: campaignId, recommendation_id: rec.id };
      } else if (p.action === "adjust_daily_budget") {
        const cur = Number(camp?.daily_budget_cents ?? 0);
        const next = Number(p.new_daily_budget_cents ?? p.suggested_daily_budget_cents ?? 0);
        if (!cur || !next) { results.push({ id: rec.id, skipped: "missing_budget" }); continue; }
        const pctChange = Math.abs((next - cur) / cur) * 100;
        const cap = isB2B ? maxBudgetPct * 0.5 : maxBudgetPct;
        if (pctChange > cap) {
          results.push({ id: rec.id, skipped: `budget_change_${pctChange.toFixed(1)}pct_exceeds_cap_${cap}pct${isB2B ? "_b2b" : ""}` });
          continue;
        }
        body = { action: "adjust_daily_budget", campaign_id: campaignId, new_daily_budget_cents: Math.round(next), recommendation_id: rec.id };
      } else {
        results.push({ id: rec.id, skipped: `unsupported_action_${p.action}` });
        continue;
      }

      const r = await fetch(execUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": Deno.env.get("KENNEL_INGEST_SECRET") ?? "",
        },
        body: JSON.stringify({ ...body, segment: isB2B ? "b2b" : "consumer" }),
      });
      const txt = await r.text().catch(() => "");
      const ok = r.status < 300;
      results.push({ id: rec.id, status: r.status, body: txt.slice(0, 200), b2b: isB2B });
      if (ok) { executedCount += 1; if (isB2B) evaluatedB2B += 1; }
    }

    budgetAfter = Math.max(0, budget - executedCount);
    await writeEvaluation(true);

    return J(200, {
      ok: true,
      considered: candidatesConsidered,
      eligible: eligibleCount,
      executed: executedCount,
      budget_remaining: budgetAfter,
      results,
    });
  } catch (e: any) {
    console.error("meta-autopilot error", e);
    return J(500, { error: e?.message ?? "Server error" });
  }
});