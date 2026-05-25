// Instacart Ads — execute a single action against Partner API (when token
// configured) and mirror the change locally. Supports manual UI actions and
// autopilot calls. Logs every attempt to ad_execution_log.
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

const BASE = "https://api.ads.instacart.com/api/v2";
const ADV = Deno.env.get("INSTACART_ADS_ADVERTISER_ID");

let cachedToken: { token: string; expires_at: number } | null = null;
async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) return cachedToken.token;
  const refresh = Deno.env.get("INSTACART_ADS_REFRESH_TOKEN");
  const cid = Deno.env.get("INSTACART_ADS_CLIENT_ID");
  const csec = Deno.env.get("INSTACART_ADS_CLIENT_SECRET");
  if (refresh && cid && csec) {
    const r = await fetch("https://api.ads.instacart.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refresh, client_id: cid, client_secret: csec }),
    });
    if (r.ok) {
      const b: any = await r.json().catch(() => ({}));
      if (b?.access_token) {
        cachedToken = { token: b.access_token, expires_at: Date.now() + Number(b.expires_in ?? 3600) * 1000 };
        return cachedToken.token;
      }
    }
  }
  return Deno.env.get("INSTACART_ADS_API_TOKEN") ?? null;
}

async function partnerCall(method: string, path: string, body?: any) {
  const tok = await getAccessToken();
  if (!tok || !ADV) return { ok: false, status: 0, error: "credentials_missing" };
  const url = `${BASE}${path}`;
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify({ advertiser_id: ADV, ...body }) : undefined,
  });
  const text = await r.text().catch(() => "");
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data, error: r.ok ? null : (text?.slice(0, 240) ?? `HTTP ${r.status}`) };
}

type Action =
  | { action: "pause_keyword"; keyword_id: string }
  | { action: "resume_keyword"; keyword_id: string }
  | { action: "set_keyword_bid"; keyword_id: string; bid_cents: number }
  | { action: "pause_campaign"; campaign_id: string }
  | { action: "resume_campaign"; campaign_id: string }
  | { action: "set_campaign_budget"; campaign_id: string; daily_budget_cents: number }
  | { action: "add_negative_keyword"; campaign_id: string; keyword: string; match_type?: string }
  | { action: "promote_search_term"; search_term_id: string; campaign_id?: string; bid_cents?: number; match_type?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const isCron = await checkSharedSecret(req, {
      functionName: "instacart-ads-execute",
      envVar: "KENNEL_INGEST_SECRET",
      headers: ["x-cron-secret"],
      alertOnFail: false,
    });
    const auth = req.headers.get("Authorization") ?? "";
    let actorId: string | null = null;
    let actorKind: "user" | "system" = "system";

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
      actorId = claims.claims.sub;
      actorKind = "user";
      const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", actorId);
      if (!(roles ?? []).some((r: any) => ["owner", "admin", "ad_ops_manager"].includes(r.role))) {
        return J(403, { error: "Forbidden" });
      }
    }

    const body = await req.json().catch(() => ({})) as Action & { recommendation_id?: string; dry_run?: boolean };
    const action = body.action;
    if (!action) return J(400, { error: "missing action" });

    let beforeValue: any = null;
    let afterValue: any = null;
    let partnerResp: { ok: boolean; status: number; data?: any; error: string | null } = {
      ok: true, status: 0, data: { dry_run: !!body.dry_run, partner_api: false }, error: null,
    };

    // Resolve external id for the entity we're acting on.
    async function resolveKeyword(id: string) {
      const { data } = await admin.from("ad_keywords").select("*").eq("id", id).maybeSingle();
      return data;
    }
    async function resolveCampaign(id: string) {
      const { data } = await admin.from("ad_campaigns").select("*").eq("id", id).maybeSingle();
      return data;
    }

    switch (action) {
      case "pause_keyword":
      case "resume_keyword": {
        const kw = await resolveKeyword((body as any).keyword_id);
        if (!kw) return J(404, { error: "keyword not found" });
        beforeValue = { status: kw.status, bid_cents: kw.bid_cents };
        const next = action === "pause_keyword" ? "paused" : "enabled";
        if (!body.dry_run) {
          partnerResp = await partnerCall("PATCH", `/keywords/${kw.external_id}`, { status: next });
        }
        afterValue = { status: next };
        if (partnerResp.ok && !body.dry_run) {
          await admin.from("ad_keywords").update({ status: next, updated_at: new Date().toISOString() }).eq("id", kw.id);
        }
        break;
      }
      case "set_keyword_bid": {
        const kw = await resolveKeyword((body as any).keyword_id);
        if (!kw) return J(404, { error: "keyword not found" });
        beforeValue = { bid_cents: kw.bid_cents };
        const bid = Math.max(1, Math.round(Number((body as any).bid_cents)));
        if (!body.dry_run) {
          partnerResp = await partnerCall("PATCH", `/keywords/${kw.external_id}`, { bid_cents: bid });
        }
        afterValue = { bid_cents: bid };
        if (partnerResp.ok && !body.dry_run) {
          await admin.from("ad_keywords").update({ bid_cents: bid, updated_at: new Date().toISOString() }).eq("id", kw.id);
        }
        break;
      }
      case "pause_campaign":
      case "resume_campaign": {
        const c = await resolveCampaign((body as any).campaign_id);
        if (!c) return J(404, { error: "campaign not found" });
        beforeValue = { status: c.status };
        const next = action === "pause_campaign" ? "paused" : "enabled";
        if (!body.dry_run) {
          partnerResp = await partnerCall("PATCH", `/campaigns/${c.external_id}`, { status: next });
        }
        afterValue = { status: next };
        if (partnerResp.ok && !body.dry_run) {
          await admin.from("ad_campaigns").update({ status: next, updated_at: new Date().toISOString() }).eq("id", c.id);
        }
        break;
      }
      case "set_campaign_budget": {
        const c = await resolveCampaign((body as any).campaign_id);
        if (!c) return J(404, { error: "campaign not found" });
        beforeValue = { daily_budget_cents: c.daily_budget_cents };
        const budget = Math.max(100, Math.round(Number((body as any).daily_budget_cents)));
        if (!body.dry_run) {
          partnerResp = await partnerCall("PATCH", `/campaigns/${c.external_id}`, { daily_budget_cents: budget });
        }
        afterValue = { daily_budget_cents: budget };
        if (partnerResp.ok && !body.dry_run) {
          await admin.from("ad_campaigns").update({ daily_budget_cents: budget, updated_at: new Date().toISOString() }).eq("id", c.id);
        }
        break;
      }
      case "add_negative_keyword": {
        const c = await resolveCampaign((body as any).campaign_id);
        if (!c) return J(404, { error: "campaign not found" });
        const kwText = String((body as any).keyword ?? "").trim();
        const match = String((body as any).match_type ?? "phrase").toLowerCase();
        if (!kwText) return J(400, { error: "keyword required" });
        beforeValue = null;
        if (!body.dry_run) {
          partnerResp = await partnerCall("POST", `/campaigns/${c.external_id}/negative_keywords`, {
            keyword: kwText, match_type: match,
          });
        }
        afterValue = { keyword: kwText, match_type: match };
        break;
      }
      case "promote_search_term": {
        const { data: st } = await admin.from("ad_search_terms").select("*").eq("id", (body as any).search_term_id).maybeSingle();
        if (!st) return J(404, { error: "search term not found" });
        const bid = Math.max(1, Math.round(Number((body as any).bid_cents ?? 50)));
        const match = String((body as any).match_type ?? "exact").toLowerCase();
        beforeValue = { resolved_at: st.resolved_at };
        if (!body.dry_run) {
          // Create as keyword in source campaign (or first enabled instacart campaign).
          let targetCampaignExt: string | null = null;
          if ((body as any).campaign_id) {
            const { data: c } = await admin.from("ad_campaigns").select("external_id").eq("id", (body as any).campaign_id).maybeSingle();
            targetCampaignExt = c?.external_id ?? null;
          } else {
            const { data: c } = await admin.from("ad_campaigns")
              .select("external_id").eq("platform_slug", "instacart").eq("status", "enabled")
              .order("spend_mtd_cents", { ascending: false }).limit(1).maybeSingle();
            targetCampaignExt = c?.external_id ?? null;
          }
          if (!targetCampaignExt) {
            partnerResp = { ok: false, status: 0, error: "no target campaign", data: null };
          } else {
            partnerResp = await partnerCall("POST", `/campaigns/${targetCampaignExt}/keywords`, {
              keyword: st.query, match_type: match, bid_cents: bid,
            });
            if (partnerResp.ok) {
              await admin.from("ad_search_terms").update({
                resolved_at: new Date().toISOString(),
                suggested_action: "promoted",
              }).eq("id", st.id);
              await admin.from("ad_keywords").insert({
                platform_slug: "instacart",
                keyword: st.query, match_type: match, status: "enabled", bid_cents: bid,
                external_id: (partnerResp.data as any)?.id ?? `promoted::${st.query}::${match}`,
              });
            }
          }
        }
        afterValue = { keyword: st.query, match_type: match, bid_cents: bid };
        break;
      }
      default:
        return J(400, { error: `unsupported action: ${action}` });
    }

    // Always record the attempt.
    await admin.from("ad_execution_log").insert({
      recommendation_id: body.recommendation_id ?? null,
      action: "execute",
      actor_id: actorId,
      actor_kind: actorKind,
      request_payload: body as any,
      response_payload: partnerResp.data ?? null,
      success: partnerResp.ok,
      error_message: partnerResp.error ?? null,
      platform: "instacart",
      executor: actorKind === "user" ? "manual" : "autopilot",
      before_value: beforeValue,
      after_value: afterValue,
    });

    // Mark recommendation as executed (or failed) if linked.
    if (body.recommendation_id) {
      await admin.from("ad_recommendations").update({
        status: partnerResp.ok ? "executed" : "failed",
        executed_at: partnerResp.ok ? new Date().toISOString() : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: actorId,
        rejection_reason: partnerResp.ok ? null : partnerResp.error,
      }).eq("id", body.recommendation_id);
    }

    return J(partnerResp.ok ? 200 : 502, {
      ok: partnerResp.ok,
      action,
      partner_api: !!(await getAccessToken()) && !!ADV,
      partner_status: partnerResp.status,
      partner_error: partnerResp.error,
      before: beforeValue,
      after: afterValue,
      dry_run: !!body.dry_run,
    });
  } catch (e: any) {
    console.error("instacart-ads-execute error", e);
    return J(500, { error: e?.message ?? "Server error" });
  }
});