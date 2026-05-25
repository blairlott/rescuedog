// Meta Marketing API executor — pause/resume campaign or adjust daily budget.
// Called by meta-autopilot for approved ad_recommendations. Mirrors the
// instacart-ads-execute contract so the autopilot loop is symmetric.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkSharedSecret } from "../_shared/cronAlert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const META_API_VERSION = "v21.0";

type Body = {
  action: "pause_campaign" | "resume_campaign" | "adjust_daily_budget";
  campaign_id: string;                   // ad_campaigns.id (uuid)
  new_daily_budget_cents?: number;       // required for adjust_daily_budget
  recommendation_id?: string;
  segment?: "consumer" | "b2b";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const isCron = await checkSharedSecret(req, {
      functionName: "meta-ads-execute",
      envVar: "KENNEL_INGEST_SECRET",
      headers: ["x-cron-secret"],
      alertOnFail: false,
    });
    const auth = req.headers.get("Authorization") ?? "";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    let actorId: string | null = null;
    if (!isCron) {
      if (!auth.startsWith("Bearer ")) return J(401, { error: "Unauthorized" });
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data: claims } = await sb.auth.getClaims(auth.replace("Bearer ", ""));
      if (!claims?.claims?.sub) return J(401, { error: "Unauthorized" });
      actorId = claims.claims.sub as string;
      const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", actorId);
      if (!(roles ?? []).some((r: any) => ["owner", "admin", "ad_ops_manager"].includes(r.role))) {
        return J(403, { error: "Forbidden" });
      }
    }

    const body: Body = await req.json().catch(() => ({} as Body));
    if (!body?.action || !body?.campaign_id) {
      return J(400, { error: "action and campaign_id required" });
    }

    const accessToken = Deno.env.get("META_ADS_ACCESS_TOKEN") ?? Deno.env.get("META_SYSTEM_USER_TOKEN");
    if (!accessToken) return J(500, { error: "META_ADS_ACCESS_TOKEN not configured" });

    // Resolve campaign + capture before-state for rollback / audit.
    const { data: camp, error: campErr } = await admin.from("ad_campaigns")
      .select("id, external_id, status, daily_budget_cents, metadata, platform_slug, name")
      .eq("id", body.campaign_id).maybeSingle();
    if (campErr) return J(500, { error: campErr.message });
    if (!camp) return J(404, { error: "campaign_not_found" });
    if (camp.platform_slug !== "meta") return J(400, { error: "not_a_meta_campaign" });
    if (!camp.external_id) return J(400, { error: "missing_meta_campaign_id" });

    const before = {
      status: camp.status,
      daily_budget_cents: camp.daily_budget_cents,
    };

    // Build Meta API call.
    const url = `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(camp.external_id)}`;
    const params = new URLSearchParams({ access_token: accessToken });
    let after: Record<string, unknown> = {};

    if (body.action === "pause_campaign") {
      params.set("status", "PAUSED");
      after = { status: "PAUSED" };
    } else if (body.action === "resume_campaign") {
      params.set("status", "ACTIVE");
      after = { status: "ACTIVE" };
    } else if (body.action === "adjust_daily_budget") {
      const cents = Number(body.new_daily_budget_cents ?? 0);
      if (!Number.isFinite(cents) || cents < 100) {
        return J(400, { error: "new_daily_budget_cents must be >= 100 (Meta minimum)" });
      }
      // Meta Marketing API expects daily_budget in account currency minor units (cents for USD).
      params.set("daily_budget", String(Math.round(cents)));
      after = { daily_budget_cents: Math.round(cents) };
    } else {
      return J(400, { error: `unsupported_action_${body.action}` });
    }

    const resp = await fetch(url, { method: "POST", body: params });
    const respText = await resp.text();
    const ok = resp.status < 300;

    // Persist mirror state on success so the dashboard reflects reality.
    if (ok) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("status" in after) patch.status = String(after.status).toLowerCase();
      if ("daily_budget_cents" in after) patch.daily_budget_cents = after.daily_budget_cents;
      await admin.from("ad_campaigns").update(patch).eq("id", camp.id);
    }

    // Mark recommendation executed.
    if (ok && body.recommendation_id) {
      await admin.from("ad_recommendations").update({
        status: "executed",
        executed_at: new Date().toISOString(),
        rollback_state: before,
      }).eq("id", body.recommendation_id);
    }

    await admin.from("ad_execution_log").insert({
      recommendation_id: body.recommendation_id ?? null,
      action: body.action,
      actor_id: actorId,
      actor_kind: isCron ? "autopilot" : "user",
      executor: isCron ? "autopilot" : "manual",
      platform: "meta",
      campaign_id: camp.external_id,
      request_payload: { ...body },
      response_payload: { status: resp.status, body: respText.slice(0, 500) },
      before_value: before,
      after_value: ok ? after : null,
      success: ok,
      error_message: ok ? null : respText.slice(0, 500),
    });

    return J(ok ? 200 : 502, { ok, action: body.action, status: resp.status, before, after });
  } catch (e: any) {
    console.error("meta-ads-execute error", e);
    return J(500, { error: e?.message ?? "Server error" });
  }
});