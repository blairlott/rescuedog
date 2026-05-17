// Live drill-down + remote pause/resume for ad platforms.
// Meta (Graph API v21.0) and Google Ads (REST v18) are live. Instacart returns a stub response.
// Auth: requires logged-in user with admin/owner or ad_ops_manager role.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const META_GRAPH_VERSION = "v21.0";
const GOOGLE_ADS_VERSION = "v18";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function metaGet(path: string, fields: string, token: string, extra: Record<string, string> = {}) {
  const qs = new URLSearchParams({ fields, access_token: token, limit: "100", ...extra });
  const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}?${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    return { ok: false as const, error: body?.error?.message ?? `HTTP ${res.status}`, body };
  }
  return { ok: true as const, body };
}

async function metaPost(entityId: string, update: Record<string, string>, token: string) {
  const form = new URLSearchParams({ ...update, access_token: token });
  const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${entityId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body?.success !== false && !body?.error, status: res.status, body };
}

// ---------------- Google Ads helpers ----------------

async function googleAccessToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, error: "Google Ads OAuth credentials missing" };
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) {
    return { ok: false, error: body?.error_description ?? body?.error ?? `token HTTP ${res.status}` };
  }
  return { ok: true, token: body.access_token as string };
}

function googleHeaders(accessToken: string) {
  const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
  const login = (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replace(/-/g, "");
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  if (login) h["login-customer-id"] = login;
  return h;
}

async function googleSearch(customerId: string, query: string, accessToken: string) {
  const cid = customerId.replace(/-/g, "");
  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cid}/googleAds:search`,
    { method: "POST", headers: googleHeaders(accessToken), body: JSON.stringify({ query }) },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body) ? body[0]?.error?.message : body?.error?.message;
    return { ok: false as const, error: msg ?? `HTTP ${res.status}`, body };
  }
  return { ok: true as const, body };
}

async function googleMutate(
  customerId: string,
  resource: "campaigns" | "adGroups" | "adGroupAds",
  resourceName: string,
  status: "ENABLED" | "PAUSED",
  accessToken: string,
) {
  const cid = customerId.replace(/-/g, "");
  const op =
    resource === "campaigns"
      ? { update: { resourceName, status }, updateMask: "status" }
      : resource === "adGroups"
      ? { update: { resourceName, status }, updateMask: "status" }
      : { update: { resourceName, status }, updateMask: "status" };
  const endpoint =
    resource === "campaigns" ? "campaigns:mutate"
    : resource === "adGroups" ? "adGroups:mutate"
    : "adGroupAds:mutate";
  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cid}/${endpoint}`,
    { method: "POST", headers: googleHeaders(accessToken), body: JSON.stringify({ operations: [op] }) },
  );
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
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

  // Role check via is_ad_ops()
  const { data: isAdOps } = await userClient.rpc("is_ad_ops", { _user_id: userId });
  if (!isAdOps) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const platform = String(body?.platform ?? "meta").toLowerCase();
  const action = String(body?.action ?? "");

  // Stubs for unwired platforms
  if (platform === "google" || platform === "instacart") {
    return json({ ok: true, platform, items: [], not_connected: true, message: `${platform} not connected yet` });
  }

  if (platform !== "meta" && platform !== "facebook") {
    return json({ error: `unknown platform: ${platform}` }, 400);
  }

  const token = Deno.env.get("META_ADS_ACCESS_TOKEN");
  const accountId = Deno.env.get("META_ADS_ACCOUNT_ID") ?? body?.account_id;
  if (!token) return json({ error: "META_ADS_ACCESS_TOKEN missing" }, 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // --- List campaigns ---
  if (action === "list_campaigns") {
    if (!accountId) return json({ error: "ad account id missing" }, 400);
    const r = await metaGet(
      `${accountId}/campaigns`,
      "id,name,status,effective_status,objective,daily_budget,lifetime_budget,buying_type,updated_time",
      token,
      { effective_status: '["ACTIVE","PAUSED","PENDING_REVIEW","WITH_ISSUES","CAMPAIGN_PAUSED","ADSET_PAUSED","DISAPPROVED","IN_PROCESS"]' },
    );
    if (!r.ok) return json({ error: r.error, body: r.body }, 502);
    return json({ ok: true, platform: "meta", items: r.body.data ?? [] });
  }

  // --- List adsets in a campaign ---
  if (action === "list_adsets") {
    const campaignId = body?.parent_id;
    if (!campaignId) return json({ error: "parent_id (campaign) required" }, 400);
    const r = await metaGet(
      `${campaignId}/adsets`,
      "id,name,status,effective_status,daily_budget,lifetime_budget,bid_amount,optimization_goal,updated_time",
      token,
    );
    if (!r.ok) return json({ error: r.error, body: r.body }, 502);
    return json({ ok: true, platform: "meta", items: r.body.data ?? [] });
  }

  // --- List ads in an adset ---
  if (action === "list_ads") {
    const adsetId = body?.parent_id;
    if (!adsetId) return json({ error: "parent_id (adset) required" }, 400);
    const r = await metaGet(
      `${adsetId}/ads`,
      "id,name,status,effective_status,creative,updated_time",
      token,
    );
    if (!r.ok) return json({ error: r.error, body: r.body }, 502);
    return json({ ok: true, platform: "meta", items: r.body.data ?? [] });
  }

  // --- Pause / resume any entity ---
  if (action === "set_status") {
    const entityId = body?.entity_id;
    const entityType = body?.entity_type; // campaign|adset|ad
    const status = String(body?.status ?? "").toUpperCase();
    if (!entityId || !["campaign", "adset", "ad"].includes(entityType)) {
      return json({ error: "entity_id and entity_type (campaign|adset|ad) required" }, 400);
    }
    if (!["ACTIVE", "PAUSED"].includes(status)) {
      return json({ error: "status must be ACTIVE or PAUSED" }, 400);
    }

    // Read current for audit
    const pre = await metaGet(entityId, "id,name,status,effective_status", token);
    if (!pre.ok) return json({ error: pre.error, body: pre.body }, 502);

    if ((pre.body.status === "ARCHIVED") || (pre.body.status === "DELETED")) {
      return json({ error: `entity is ${pre.body.status} and cannot be edited` }, 422);
    }

    const result = await metaPost(entityId, { status }, token);

    // Audit into ad_execution_log (no recommendation tied)
    await admin.from("ad_execution_log").insert({
      recommendation_id: null,
      action: status === "PAUSED" ? "pause" : "resume",
      actor_id: userId,
      actor_kind: "user",
      request_payload: { platform: "meta", entity_type: entityType, entity_id: entityId, status, pre: pre.body },
      response_payload: { status: result.status, body: result.body },
      success: result.ok,
    });

    return json({ ok: result.ok, before: pre.body, response: result.body });
  }

  return json({ error: `unknown action: ${action}` }, 400);
});