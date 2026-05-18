// Approve, reject, or execute a Kennel recommendation.
// Auth: requires logged-in user with admin/owner or ad_ops_manager role.
// For approve/reject we call the SECURITY DEFINER RPC `kennel_review_recommendation`.
// For execute we dispatch to the platform API (Meta wired live; others stubbed) then mark executed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const META_GRAPH_VERSION = "v21.0";

type MetaDispatchResult = {
  dispatched: boolean;
  ok: boolean;
  status?: number;
  request?: Record<string, unknown>;
  response?: unknown;
  rollback_state?: Record<string, unknown>;
  error?: string;
};

type DispatchResult = MetaDispatchResult;

async function dispatchGoogle(payload: any): Promise<DispatchResult> {
  const token = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
  const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!token || !devToken) {
    return { dispatched: false, ok: false, error: "Google Ads credentials missing" };
  }
  const campaignId = payload?.entity_id;
  const change = payload?.change ?? {};
  if (!campaignId) return { dispatched: false, ok: false, error: "payload.entity_id required for google" };
  if (typeof change.daily_budget_cents !== "number") {
    return { dispatched: false, ok: false, error: "only daily_budget_cents supported for google in v1" };
  }
  // Proxy through existing google-ads-proxy edge function which already handles OAuth refresh.
  try {
    const proxyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-ads-proxy`;
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        op: "campaign_budget_mutate",
        campaign_id: campaignId,
        amount_micros: change.daily_budget_cents * 10_000, // cents → micros
      }),
    });
    const j = await res.json().catch(() => ({}));
    return {
      dispatched: true,
      ok: res.ok,
      status: res.status,
      request: { campaignId, amount_micros: change.daily_budget_cents * 10_000 },
      response: j,
      rollback_state: payload?.current ?? {},
      error: res.ok ? undefined : `google ${res.status}: ${JSON.stringify(j)}`,
    };
  } catch (e: any) {
    return { dispatched: false, ok: false, error: e?.message ?? String(e) };
  }
}

async function dispatchInstacart(payload: any): Promise<DispatchResult> {
  const apiToken = Deno.env.get("INSTACART_ADS_API_TOKEN");
  const advertiserId = Deno.env.get("INSTACART_ADS_ADVERTISER_ID");
  if (!apiToken || !advertiserId) {
    return { dispatched: false, ok: false, error: "Instacart Ads credentials missing" };
  }
  const change = payload?.change ?? {};
  const campaignId = payload?.entity_id;
  if (!campaignId) return { dispatched: false, ok: false, error: "payload.entity_id required for instacart" };
  // v1: bid adjustments only. Daily budget change still echoed for parity.
  try {
    const body: Record<string, unknown> = {};
    if (typeof change.bid_cents === "number") body.bid_cents = change.bid_cents;
    if (typeof change.daily_budget_cents === "number") body.daily_budget_cents = change.daily_budget_cents;
    const res = await fetch(`https://ads.instacart.com/api/v2/advertisers/${advertiserId}/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    return {
      dispatched: true,
      ok: res.ok,
      status: res.status,
      request: body,
      response: j,
      rollback_state: payload?.current ?? {},
      error: res.ok ? undefined : `instacart ${res.status}: ${JSON.stringify(j)}`,
    };
  } catch (e: any) {
    return { dispatched: false, ok: false, error: e?.message ?? String(e) };
  }
}

// Fire-and-forget alert dispatch
async function fireAlert(admin: any, body: Record<string, unknown>) {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/kennel-alert-dispatch`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify(body),
    });
  } catch (_) { /* non-fatal */ }
}

// Check 24h cumulative delta % for this platform/campaign against baseline.
async function cumulative24hDelta(admin: any, platform: string, campaignId: string | null, baselineCents: number | null): Promise<{ pct: number; sumDeltaCents: number }> {
  if (!baselineCents || baselineCents <= 0) return { pct: 0, sumDeltaCents: 0 };
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let q = admin.from("ad_execution_log").select("delta_pct, spend_impact_cents").eq("platform", platform).eq("success", true).gte("created_at", since);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data } = await q;
  const sumDeltaCents = (data ?? []).reduce((s: number, r: any) => s + Math.abs(r.spend_impact_cents ?? 0), 0);
  const pct = (sumDeltaCents / baselineCents) * 100;
  return { pct, sumDeltaCents };
}

/**
 * Dispatch a Meta Marketing API change for a campaign or adset.
 * Expected recommendation.payload shape:
 *   { platform:"meta", entity_type:"campaign"|"adset", entity_id:"<id>",
 *     change:{ daily_budget_cents?, lifetime_budget_cents?, status? },
 *     current?:{ daily_budget_cents?, status? } }
 */
async function dispatchMeta(payload: any): Promise<MetaDispatchResult> {
  const token = Deno.env.get("META_ADS_ACCESS_TOKEN");
  if (!token) return { dispatched: false, ok: false, error: "META_ADS_ACCESS_TOKEN missing" };

  const entityType = payload?.entity_type;
  const entityId = payload?.entity_id;
  const change = payload?.change ?? {};
  if (!entityId || !["campaign", "adset"].includes(entityType)) {
    return { dispatched: false, ok: false, error: "payload.entity_type/entity_id invalid for meta" };
  }

  // Read current state for rollback (best-effort).
  const fields = entityType === "campaign"
    ? "id,name,status,daily_budget,lifetime_budget"
    : "id,name,status,daily_budget,lifetime_budget,bid_amount";
  let rollbackState: Record<string, unknown> = {};
  try {
    const readRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${entityId}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
    );
    if (readRes.ok) rollbackState = await readRes.json();
  } catch (_) { /* non-fatal */ }

  // Pre-flight: Meta refuses any edit on ARCHIVED/DELETED entities except renaming.
  const currentStatus = (rollbackState as any)?.status;
  if (currentStatus === "ARCHIVED" || currentStatus === "DELETED") {
    return {
      dispatched: false,
      ok: false,
      error: `entity is ${currentStatus} on Meta and cannot be edited — duplicate it in Ads Manager and re-target`,
      rollback_state: rollbackState,
    };
  }

  // Build update body. Meta budgets are in account-currency MINOR units (cents for USD).
  const update: Record<string, string> = {};
  if (typeof change.daily_budget_cents === "number") update.daily_budget = String(Math.round(change.daily_budget_cents));
  if (typeof change.lifetime_budget_cents === "number") update.lifetime_budget = String(Math.round(change.lifetime_budget_cents));
  if (typeof change.status === "string") update.status = change.status.toUpperCase();
  if (Object.keys(update).length === 0) {
    return { dispatched: false, ok: false, error: "no supported fields in change", rollback_state: rollbackState };
  }

  const form = new URLSearchParams({ ...update, access_token: token });
  const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${entityId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const responseJson = await res.json().catch(() => ({}));
  return {
    dispatched: true,
    ok: res.ok && responseJson?.success !== false && !responseJson?.error,
    status: res.status,
    request: { entity_type: entityType, entity_id: entityId, update },
    response: responseJson,
    rollback_state: rollbackState,
  };
}

/** Apply guardrails for a recommendation. Returns null if ok, or error string. */
async function checkGuardrails(admin: any, rec: any): Promise<string | null> {
  if (!rec.channel_id) return null;
  const { data: g } = await admin.from("ad_guardrails").select("*").eq("channel_id", rec.channel_id).maybeSingle();
  if (!g) return null;
  if (g.paused) return "channel is paused via guardrails";

  const change = rec.payload?.change ?? {};
  const current = rec.payload?.current ?? {};

  // Daily spend cap
  if (typeof change.daily_budget_cents === "number" && change.daily_budget_cents > g.daily_spend_cap_cents) {
    return `daily_budget_cents ${change.daily_budget_cents} exceeds cap ${g.daily_spend_cap_cents}`;
  }
  // Budget % change
  if (typeof change.daily_budget_cents === "number" && typeof current.daily_budget_cents === "number" && current.daily_budget_cents > 0) {
    const pct = Math.abs(change.daily_budget_cents - current.daily_budget_cents) / current.daily_budget_cents * 100;
    if (pct > Number(g.max_budget_change_pct)) {
      return `budget change ${pct.toFixed(1)}% exceeds max ${g.max_budget_change_pct}%`;
    }
  }
  return null;
}

/** Decide whether an approved rec should auto-execute based on per-channel rules. */
async function shouldAutoExecute(admin: any, rec: any): Promise<{ go: boolean; reason: string }> {
  if (!rec.channel_id) return { go: false, reason: "no channel_id" };
  const { data: g } = await admin.from("ad_guardrails").select("*").eq("channel_id", rec.channel_id).maybeSingle();
  if (!g) return { go: false, reason: "no guardrails row" };
  if (!g.auto_execute_enabled) return { go: false, reason: "auto_execute disabled" };
  if (g.paused) return { go: false, reason: "channel paused" };
  if (Number(rec.confidence ?? 0) < Number(g.auto_execute_min_confidence)) {
    return { go: false, reason: `confidence ${rec.confidence} < ${g.auto_execute_min_confidence}` };
  }
  if (Number(rec.projected_impact_cents ?? 0) > Number(g.auto_execute_max_impact_cents)) {
    return { go: false, reason: `impact ${rec.projected_impact_cents} > cap ${g.auto_execute_max_impact_cents}` };
  }
  const change = rec.payload?.change ?? {};
  const current = rec.payload?.current ?? {};
  if (typeof change.daily_budget_cents === "number" && typeof current.daily_budget_cents === "number" && current.daily_budget_cents > 0) {
    const pct = Math.abs(change.daily_budget_cents - current.daily_budget_cents) / current.daily_budget_cents * 100;
    if (pct > Number(g.auto_execute_max_budget_change_pct)) {
      return { go: false, reason: `budget Δ ${pct.toFixed(1)}% > ${g.auto_execute_max_budget_change_pct}%` };
    }
  }
  return { go: true, reason: "ok" };
}

/** Dispatch + log an execute for an already-approved rec. Returns response shape for JSON. */
async function runExecute(admin: any, recId: string, actorId: string | null, actorKind: "user" | "auto", notes: string | null) {
  const { data: rec } = await admin.from("ad_recommendations").select("*").eq("id", recId).maybeSingle();
  if (!rec) return { ok: false, error: "not found" };
  if (rec.status !== "approved") return { ok: false, error: `cannot execute (status=${rec.status})` };

  const guardErr = await checkGuardrails(admin, rec);
  if (guardErr) {
    await admin.from("ad_execution_log").insert({
      recommendation_id: recId, action: "execute", actor_id: actorId, actor_kind: actorKind,
      request_payload: { notes, auto: actorKind === "auto" }, response_payload: { error: guardErr }, success: false,
    });
    return { ok: false, error: guardErr };
  }

  const platform = (rec.payload?.platform ?? "").toString().toLowerCase();
  let dispatch: DispatchResult;
  if (platform === "meta" || platform === "facebook") {
    dispatch = await dispatchMeta(rec.payload);
  } else if (platform === "google") {
    dispatch = await dispatchGoogle(rec.payload);
  } else if (platform === "instacart") {
    dispatch = await dispatchInstacart(rec.payload);
  } else {
    dispatch = {
      dispatched: false, ok: true,
      response: { skipped: true, reason: `platform '${platform || "unknown"}' not wired yet` },
      rollback_state: rec.payload?.rollback_state ?? {},
    };
  }

  // If Meta says the entity is archived/deleted, auto-reject (not "failed") with a clear reason.
  const autoRejectReason = !dispatch.ok && dispatch.error && /ARCHIVED|DELETED|deleted|archived/.test(dispatch.error)
    ? dispatch.error
    : null;

  // Compute delta + impact for guardrail tracking.
  const change = rec.payload?.change ?? {};
  const current = rec.payload?.current ?? {};
  const before = current?.daily_budget_cents ?? null;
  const after = change?.daily_budget_cents ?? null;
  const deltaCents = (before != null && after != null) ? (after - before) : null;
  const deltaPct = (before && deltaCents != null) ? (deltaCents / before) * 100 : null;

  // Find current baseline row (best-effort)
  let baselineId: string | null = null;
  try {
    const { data: b } = await admin.from("guardrail_baseline").select("id")
      .eq("platform", platform).eq("is_current", true)
      .eq("campaign_id", rec.payload?.entity_id ?? null).maybeSingle();
    baselineId = b?.id ?? null;
  } catch (_) { /* ignore */ }

  await admin.from("ad_recommendations").update({
    status: dispatch.ok ? "executed" : (autoRejectReason ? "rejected" : "failed"),
    executed_at: dispatch.ok ? new Date().toISOString() : null,
    rejection_reason: autoRejectReason ?? (dispatch.ok ? null : (dispatch.error ?? null)),
    rollback_state: dispatch.rollback_state ?? rec.payload?.rollback_state ?? {},
  }).eq("id", recId);

  await admin.from("ad_execution_log").insert({
    recommendation_id: recId, action: "execute", actor_id: actorId, actor_kind: actorKind,
    request_payload: { notes, auto: actorKind === "auto", platform, dispatch_request: dispatch.request ?? null },
    response_payload: { dispatched: dispatch.dispatched, status: dispatch.status ?? null, response: dispatch.response ?? null, error: dispatch.error ?? null },
    success: dispatch.ok,
    platform,
    campaign_id: rec.payload?.entity_id ?? null,
    before_value: current ?? null,
    after_value: change ?? null,
    delta_pct: deltaPct,
    spend_impact_cents: deltaCents,
    executor: actorKind === "auto" ? "auto" : "manual_approval",
    baseline_id: baselineId,
    guardrail_results: { passed: dispatch.ok, error: dispatch.error ?? null },
  });

  // Fire alert on auto-executed changes
  if (actorKind === "auto") {
    await fireAlert(admin, {
      event_type: "auto_executed",
      channel: platform,
      action: rec.title ?? "budget change",
      spend_impact_cents: deltaCents,
      confidence: Number(rec.confidence ?? 0),
      deep_link: `https://rescuedog.lovable.app/kennel/log?execution=${recId}`,
      message: dispatch.ok ? "Auto-executed and platform confirmed." : `FAILED: ${dispatch.error ?? "unknown"}`,
    });
  }

  return { ok: dispatch.ok, dispatched: dispatch.dispatched, response: dispatch.response, error: dispatch.error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claims?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { recommendation_id, action, notes } = body ?? {};
  if (!recommendation_id || !["approve", "reject", "execute", "rollback"].includes(action)) {
    return json({ error: "recommendation_id and valid action required" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Kill-switch check for execute
  if (action === "execute" || action === "approve") {
    const { data: killRow } = await admin.from("ad_settings").select("value").eq("key", "kill_switch").maybeSingle();
    if (killRow?.value === true) return json({ error: "kill switch is engaged" }, 423);
  }

  if (action === "approve" || action === "reject") {
    // Use user-scoped client so auth.uid() resolves inside the RPC
    const { data, error } = await userClient.rpc("kennel_review_recommendation", {
      _rec_id: recommendation_id,
      _action: action,
      _notes: notes ?? null,
    });
    if (error) return json({ error: error.message }, 400);

    // Persist the rejection reason on the rec for UI display.
    if (action === "reject" && notes) {
      await admin.from("ad_recommendations").update({ rejection_reason: notes }).eq("id", recommendation_id);
    }

    // Auto-execute hook: if approved and per-channel guardrails allow, dispatch immediately.
    let autoResult: any = null;
    if (action === "approve") {
      const { data: freshRec } = await admin.from("ad_recommendations").select("*").eq("id", recommendation_id).maybeSingle();
      if (freshRec) {
        const decision = await shouldAutoExecute(admin, freshRec);
        if (decision.go) {
          autoResult = await runExecute(admin, recommendation_id, userId, "auto", notes ?? "auto-executed after approve");
        } else {
          autoResult = { auto_skipped: true, reason: decision.reason };
        }
      }
    }
    return json({ ok: true, recommendation: data, auto: autoResult });
  }

  // execute / rollback paths
  const { data: rec, error: recErr } = await admin
    .from("ad_recommendations").select("*").eq("id", recommendation_id).maybeSingle();
  if (recErr || !rec) return json({ error: "not found" }, 404);

  if (action === "execute") {
    const result = await runExecute(admin, recommendation_id, userId, "user", notes ?? null);
    if (!result.ok && result.error && !result.dispatched) return json(result, 422);
    return json(result);
  }

  if (action === "rollback") {
    if (rec.status !== "executed") return json({ error: `cannot rollback (status=${rec.status})` }, 400);

    // If we have meta rollback state, attempt to restore.
    const platform = (rec.payload?.platform ?? "").toString().toLowerCase();
    let dispatch: MetaDispatchResult = { dispatched: false, ok: true };
    if ((platform === "meta" || platform === "facebook") && rec.rollback_state) {
      const rb = rec.rollback_state as any;
      const restorePayload = {
        entity_type: rec.payload?.entity_type,
        entity_id: rec.payload?.entity_id ?? rb.id,
        change: {
          ...(rb.daily_budget != null ? { daily_budget_cents: Number(rb.daily_budget) } : {}),
          ...(rb.lifetime_budget != null ? { lifetime_budget_cents: Number(rb.lifetime_budget) } : {}),
          ...(rb.status ? { status: rb.status } : {}),
        },
      };
      dispatch = await dispatchMeta(restorePayload);
    }

    const { error: updErr } = await admin
      .from("ad_recommendations")
      .update({ status: dispatch.ok ? "rolled_back" : "failed" })
      .eq("id", recommendation_id);
    if (updErr) return json({ error: updErr.message }, 500);
    await admin.from("ad_execution_log").insert({
      recommendation_id, action: "rollback", actor_id: userId, actor_kind: "user",
      request_payload: { notes: notes ?? null, rollback_state: rec.rollback_state },
      response_payload: { dispatched: dispatch.dispatched, response: dispatch.response ?? null, error: dispatch.error ?? null },
      success: dispatch.ok,
    });
    return json({ ok: dispatch.ok, dispatched: dispatch.dispatched, response: dispatch.response, error: dispatch.error });
  }

  return json({ error: "unhandled" }, 400);
});