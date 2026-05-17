// Live drill-down + remote pause/resume for ad platforms.
// Meta (Graph API v21.0) and Google Ads (REST v18) are live. Instacart returns a stub response.
// Auth: requires logged-in user with admin/owner or ad_ops_manager role.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const META_GRAPH_VERSION = "v21.0";
const GOOGLE_ADS_VERSION = "v21";
const INSTACART_BASE = "https://api.ads.instacart.com/api/v3";
const INSTACART_TOKEN_URL = "https://api.ads.instacart.com/oauth/token";

// In-memory cache per cold start.
let _icTokenCache: { token: string; expires_at: number } | null = null;
let _icAdvertiserCache: string | null = null;
async function instacartAccessToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const clientId = Deno.env.get("INSTACART_ADS_CLIENT_ID");
  const clientSecret = Deno.env.get("INSTACART_ADS_CLIENT_SECRET");
  const refreshToken = Deno.env.get("INSTACART_ADS_REFRESH_TOKEN");
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Instacart OAuth credentials missing (client id/secret)" };
  }
  if (_icTokenCache && _icTokenCache.expires_at > Date.now() + 30_000) {
    return { ok: true, token: _icTokenCache.token };
  }
  // Instacart Ads API: credentials go in JSON body (NOT Basic auth, NOT form-urlencoded).
  // This matches the working workflows I1/I2/I3/Z7.
  if (!refreshToken) {
    return { ok: false, error: "INSTACART_ADS_REFRESH_TOKEN missing" };
  }
  const res = await fetch(INSTACART_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok || !b?.access_token) {
    return { ok: false, error: b?.error_description ?? b?.error ?? `token HTTP ${res.status}` };
  }
  const ttlSec = Number(b.expires_in ?? 3600);
  _icTokenCache = { token: b.access_token as string, expires_at: Date.now() + ttlSec * 1000 };
  return { ok: true, token: b.access_token as string };
}

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
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok || !body?.access_token) {
    const parts = [body?.error, body?.error_description].filter(Boolean);
    return { ok: false, error: parts.length ? parts.join(": ") : `token HTTP ${res.status}` };
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
  let res: Response;
  try {
    res = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cid}/googleAds:search`,
      { method: "POST", headers: googleHeaders(accessToken), body: JSON.stringify({ query }) },
    );
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e), body: null };
  }
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = Array.isArray(body) ? body[0]?.error?.message : body?.error?.message;
    return { ok: false as const, error: msg ?? `HTTP ${res.status}`, body };
  }
  return { ok: true as const, body };
}

function googleError(action: string, error: string, details?: unknown) {
  console.error(`google ${action} failed`, JSON.stringify(details ?? { error }).slice(0, 4000));
  return json({ ok: false, platform: "google", items: [], error: `Google Ads: ${error}`, details, fallback: true });
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

  try {
    return await handle(req);
  } catch (e) {
    console.error("kennel-meta-browse uncaught", e instanceof Error ? e.stack : String(e));
    return json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    }, 200);
  }
});

async function handle(req: Request): Promise<Response> {

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

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---------------- Instacart Ads ----------------
  if (platform === "instacart") {
    const tk = await instacartAccessToken();
    if (!tk.ok) {
      return json({ ok: true, platform: "instacart", items: [], not_connected: true, message: tk.error });
    }
    // Resolve advertiser ID: secret -> body -> auto-discover via /advertisers
    let advertiserId: string | undefined =
      Deno.env.get("INSTACART_ADS_ADVERTISER_ID") || body?.advertiser_id || _icAdvertiserCache || undefined;
    if (!advertiserId) {
      const dRes = await fetch(`${INSTACART_BASE}/advertisers`, {
        headers: { Authorization: `Bearer ${tk.token}`, "Content-Type": "application/json" },
      });
      const dBody = await dRes.json().catch(() => ({}));
      const list = dBody?.advertisers ?? dBody?.data ?? dBody ?? [];
      const first = Array.isArray(list) ? list[0] : null;
      if (first?.id) {
        advertiserId = String(first.id);
        _icAdvertiserCache = advertiserId;
      } else {
        return json({ ok: true, platform: "instacart", items: [], not_connected: true,
          message: `Could not auto-discover advertiser ID (HTTP ${dRes.status}). Response: ${JSON.stringify(dBody).slice(0, 200)}` });
      }
    }
    const icHeaders = {
      Authorization: `Bearer ${tk.token}`,
      "Content-Type": "application/json",
      "Instacart-Ads-Advertiser-Id": String(advertiserId),
    };

    const icGet = async (path: string) => {
      const res = await fetch(`${INSTACART_BASE}${path}`, { headers: icHeaders });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false as const, error: b?.error?.message ?? b?.message ?? `HTTP ${res.status}`, body: b };
      return { ok: true as const, body: b };
    };
    const icPatch = async (path: string, payload: any) => {
      const res = await fetch(`${INSTACART_BASE}${path}`, {
        method: "PATCH", headers: icHeaders, body: JSON.stringify(payload),
      });
      const b = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body: b };
    };
    const mapStatus = (s?: string) => {
      const v = (s ?? "").toLowerCase();
      if (v === "active" || v === "enabled" || v === "running") return "ACTIVE";
      if (v === "paused") return "PAUSED";
      if (v === "archived" || v === "ended" || v === "completed") return "ARCHIVED";
      return (s ?? "").toUpperCase();
    };

    if (action === "list_campaigns") {
      const r = await icGet(`/campaigns?advertiser_id=${advertiserId}&limit=100`);
      if (!r.ok) return json({ error: r.error, body: r.body }, 502);
      const raw = r.body?.campaigns ?? r.body?.data ?? r.body ?? [];
      const items = (Array.isArray(raw) ? raw : []).map((c: any) => ({
        id: String(c.id),
        name: c.name,
        status: mapStatus(c.status),
        effective_status: mapStatus(c.status),
        objective: c.objective ?? c.campaign_type,
        daily_budget: c.daily_budget_cents ? String(c.daily_budget_cents) : (c.budget?.daily_cents ? String(c.budget.daily_cents) : undefined),
        updated_time: c.updated_at,
      }));
      return json({ ok: true, platform: "instacart", items });
    }

    if (action === "list_adsets") {
      const campaignId = body?.parent_id;
      if (!campaignId) return json({ error: "parent_id (campaign) required" }, 400);
      const r = await icGet(`/ad_groups?campaign_id=${campaignId}&limit=100`);
      if (!r.ok) return json({ error: r.error, body: r.body }, 502);
      const raw = r.body?.ad_groups ?? r.body?.data ?? r.body ?? [];
      const items = (Array.isArray(raw) ? raw : []).map((g: any) => ({
        id: String(g.id),
        name: g.name,
        status: mapStatus(g.status),
        effective_status: mapStatus(g.status),
        optimization_goal: g.optimization_goal ?? g.targeting_strategy,
        daily_budget: g.daily_budget_cents ? String(g.daily_budget_cents) : undefined,
        updated_time: g.updated_at,
      }));
      return json({ ok: true, platform: "instacart", items });
    }

    if (action === "list_ads") {
      const adGroupId = body?.parent_id;
      if (!adGroupId) return json({ error: "parent_id (ad_group) required" }, 400);
      const r = await icGet(`/ad_group_products?ad_group_id=${adGroupId}&limit=200`);
      if (!r.ok) return json({ error: r.error, body: r.body }, 502);
      const raw = r.body?.ad_group_products ?? r.body?.data ?? r.body ?? [];
      const items = (Array.isArray(raw) ? raw : []).map((a: any) => ({
        id: String(a.id),
        name: a.product_name ?? a.name ?? a.upc ?? `Product ${a.product_id ?? a.id}`,
        status: mapStatus(a.status),
        effective_status: mapStatus(a.status),
        updated_time: a.updated_at,
      }));
      return json({ ok: true, platform: "instacart", items });
    }

    if (action === "set_status") {
      const entityType = body?.entity_type;
      const entityId = body?.entity_id;
      const inStatus = String(body?.status ?? "").toUpperCase();
      const icStatus = inStatus === "ACTIVE" ? "active" : "paused";
      if (!entityId || !["campaign", "adset", "ad"].includes(entityType)) {
        return json({ error: "entity_id and entity_type required" }, 400);
      }
      const path =
        entityType === "campaign" ? `/campaigns/${entityId}`
        : entityType === "adset" ? `/ad_groups/${entityId}`
        : `/ad_group_products/${entityId}`;
      const result = await icPatch(path, { status: icStatus });

      await admin.from("ad_execution_log").insert({
        recommendation_id: null,
        action: icStatus === "paused" ? "pause" : "resume",
        actor_id: userId,
        actor_kind: "user",
        request_payload: { platform: "instacart", entity_type: entityType, entity_id: entityId, status: icStatus },
        response_payload: { status: result.status, body: result.body },
        success: result.ok,
      });

      return json({ ok: result.ok, response: result.body });
    }

    if (action === "update_entity") {
      const entityType = body?.entity_type;
      const entityId = body?.entity_id;
      const fields = (body?.fields ?? {}) as Record<string, unknown>;
      if (!entityId || !["campaign", "adset", "ad"].includes(entityType)) {
        return json({ error: "entity_id and entity_type required" }, 400);
      }
      const allow: Record<string, string[]> = {
        campaign: ["name", "daily_budget_cents", "total_budget_cents", "start_date", "end_date"],
        adset: ["name", "daily_budget_cents", "default_bid"],
        ad: ["bid_override"],
      };
      const clean: Record<string, unknown> = {};
      for (const k of allow[entityType]) {
        if (fields[k] !== undefined && fields[k] !== "" && fields[k] !== null) clean[k] = fields[k];
      }
      if (Object.keys(clean).length === 0) return json({ error: "no editable fields supplied" }, 400);
      const path =
        entityType === "campaign" ? `/campaigns/${entityId}`
        : entityType === "adset" ? `/ad_groups/${entityId}`
        : `/ad_group_products/${entityId}`;
      const result = await icPatch(path, clean);
      await admin.from("ad_execution_log").insert({
        recommendation_id: null,
        action: "update",
        actor_id: userId,
        actor_kind: "user",
        request_payload: { platform: "instacart", entity_type: entityType, entity_id: entityId, fields: clean },
        response_payload: { status: result.status, body: result.body },
        success: result.ok,
      });
      return json({ ok: result.ok, response: result.body });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  }

  // ---------------- Google Ads ----------------
  if (platform === "google" || platform === "google_ads" || platform === "googleads") {
    const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? body?.customer_id;
    if (!Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || !customerId) {
      return json({ ok: true, platform: "google", items: [], not_connected: true, message: "Google Ads credentials missing" });
    }
    const tk = await googleAccessToken();
    if (!tk.ok) return googleError("token", tk.error);
    const cidClean = customerId.replace(/-/g, "");

    if (action === "list_campaigns") {
      const r = await googleSearch(
        customerId,
        `SELECT campaign.id, campaign.name, campaign.status, campaign.resource_name, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status IN ('ENABLED','PAUSED') ORDER BY campaign.name`,
        tk.token,
      );
      if (!r.ok) {
        return googleError("list_campaigns", r.error, r.body);
      }
      const items = (r.body.results ?? []).map((row: any) => ({
        id: String(row.campaign.id),
        name: row.campaign.name,
        status: row.campaign.status,
        effective_status: row.campaign.status,
        objective: row.campaign.advertisingChannelType,
        daily_budget: row.campaignBudget?.amountMicros ? String(Math.round(Number(row.campaignBudget.amountMicros) / 10000)) : undefined,
        resource_name: row.campaign.resourceName,
      }));
      return json({ ok: true, platform: "google", items });
    }

    if (action === "list_adsets") {
      const campaignId = body?.parent_id;
      if (!campaignId) return json({ error: "parent_id (campaign) required" }, 400);
      const r = await googleSearch(
        customerId,
        `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.resource_name, ad_group.type, ad_group.cpc_bid_micros FROM ad_group WHERE campaign.id = ${Number(campaignId)} AND ad_group.status IN ('ENABLED','PAUSED') ORDER BY ad_group.name`,
        tk.token,
      );
      if (!r.ok) return googleError("list_adsets", r.error, r.body);
      const items = (r.body.results ?? []).map((row: any) => ({
        id: String(row.adGroup.id),
        name: row.adGroup.name,
        status: row.adGroup.status,
        effective_status: row.adGroup.status,
        optimization_goal: row.adGroup.type,
        daily_budget: row.adGroup.cpcBidMicros ? String(Math.round(Number(row.adGroup.cpcBidMicros) / 10000)) : undefined,
        resource_name: row.adGroup.resourceName,
      }));
      return json({ ok: true, platform: "google", items });
    }

    if (action === "list_ads") {
      const adGroupId = body?.parent_id;
      if (!adGroupId) return json({ error: "parent_id (adgroup) required" }, 400);
      const r = await googleSearch(
        customerId,
        `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group_ad.resource_name, ad_group_ad.ad.type FROM ad_group_ad WHERE ad_group.id = ${Number(adGroupId)} AND ad_group_ad.status IN ('ENABLED','PAUSED')`,
        tk.token,
      );
      if (!r.ok) return googleError("list_ads", r.error, r.body);
      const items = (r.body.results ?? []).map((row: any) => ({
        id: String(row.adGroupAd.ad.id),
        name: row.adGroupAd.ad.name ?? `${row.adGroupAd.ad.type} ad`,
        status: row.adGroupAd.status,
        effective_status: row.adGroupAd.status,
        resource_name: row.adGroupAd.resourceName,
      }));
      return json({ ok: true, platform: "google", items });
    }

    if (action === "set_status") {
      const entityType = body?.entity_type;
      const incoming = body?.resource_name ?? body?.entity_id;
      const inStatus = String(body?.status ?? "").toUpperCase();
      const gStatus = inStatus === "ACTIVE" ? "ENABLED" : "PAUSED";
      if (!incoming || !["campaign", "adset", "ad"].includes(entityType)) {
        return json({ error: "entity_id and entity_type required" }, 400);
      }
      const rn = String(incoming).includes("/")
        ? incoming
        : entityType === "campaign" ? `customers/${cidClean}/campaigns/${incoming}`
        : entityType === "adset" ? `customers/${cidClean}/adGroups/${incoming}`
        : `customers/${cidClean}/adGroupAds/${incoming}`;
      const resource = entityType === "campaign" ? "campaigns" : entityType === "adset" ? "adGroups" : "adGroupAds";
      const result = await googleMutate(customerId, resource as any, rn, gStatus as any, tk.token);

      await admin.from("ad_execution_log").insert({
        recommendation_id: null,
        action: gStatus === "PAUSED" ? "pause" : "resume",
        actor_id: userId,
        actor_kind: "user",
        request_payload: { platform: "google", entity_type: entityType, resource_name: rn, status: gStatus },
        response_payload: { status: result.status, body: result.body },
        success: result.ok,
      });

      return json({ ok: result.ok, response: result.body });
    }

    if (action === "update_entity") {
      const entityType = body?.entity_type;
      const incoming = body?.resource_name ?? body?.entity_id;
      const fields = (body?.fields ?? {}) as Record<string, unknown>;
      if (!incoming || !["campaign", "adset", "ad"].includes(entityType)) {
        return json({ error: "entity_id and entity_type required" }, 400);
      }
      const rn = String(incoming).includes("/")
        ? String(incoming)
        : entityType === "campaign" ? `customers/${cidClean}/campaigns/${incoming}`
        : entityType === "adset" ? `customers/${cidClean}/adGroups/${incoming}`
        : `customers/${cidClean}/adGroupAds/${incoming}`;
      const fieldMap: Record<string, string> = {
        name: "name",
        start_date: "startDate",
        end_date: "endDate",
        cpc_bid_micros: "cpcBidMicros",
        status: "status",
      };
      const update: Record<string, unknown> = { resourceName: rn };
      const masks: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined || v === "" || v === null) continue;
        const fk = fieldMap[k] ?? k;
        update[fk] = v;
        masks.push(fk);
      }
      if (masks.length === 0) return json({ error: "no editable fields supplied" }, 400);
      const endpoint = entityType === "campaign" ? "campaigns:mutate" : entityType === "adset" ? "adGroups:mutate" : "adGroupAds:mutate";
      const res = await fetch(
        `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cidClean}/${endpoint}`,
        {
          method: "POST",
          headers: googleHeaders(tk.token),
          body: JSON.stringify({ operations: [{ update, updateMask: masks.join(",") }] }),
        },
      );
      const respBody = await res.json().catch(() => ({}));
      await admin.from("ad_execution_log").insert({
        recommendation_id: null,
        action: "update",
        actor_id: userId,
        actor_kind: "user",
        request_payload: { platform: "google", entity_type: entityType, resource_name: rn, fields, update_mask: masks },
        response_payload: { status: res.status, body: respBody },
        success: res.ok,
      });
      return json({ ok: res.ok, response: respBody });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  }

  if (platform !== "meta" && platform !== "facebook") {
    return json({ error: `unknown platform: ${platform}` }, 400);
  }

  const token = Deno.env.get("META_ADS_ACCESS_TOKEN");
  const accountId = Deno.env.get("META_ADS_ACCOUNT_ID") ?? body?.account_id;
  if (!token) return json({ error: "META_ADS_ACCESS_TOKEN missing" }, 500);

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

  // --- Update any entity (meta) ---
  if (action === "update_entity") {
    const entityId = body?.entity_id;
    const entityType = body?.entity_type;
    const fields = (body?.fields ?? {}) as Record<string, unknown>;
    if (!entityId || !["campaign", "adset", "ad"].includes(entityType)) {
      return json({ error: "entity_id and entity_type required" }, 400);
    }
    const allow: Record<string, string[]> = {
      campaign: ["name", "daily_budget", "lifetime_budget", "spend_cap", "status"],
      adset: ["name", "daily_budget", "lifetime_budget", "bid_amount", "optimization_goal", "start_time", "end_time", "status"],
      ad: ["name", "status"],
    };
    const update: Record<string, string> = {};
    for (const k of allow[entityType]) {
      const v = fields[k];
      if (v !== undefined && v !== "" && v !== null) update[k] = String(v);
    }
    if (Object.keys(update).length === 0) return json({ error: "no editable fields supplied" }, 400);
    const pre = await metaGet(entityId, "id,name,status", token);
    const result = await metaPost(entityId, update, token);
    await admin.from("ad_execution_log").insert({
      recommendation_id: null,
      action: "update",
      actor_id: userId,
      actor_kind: "user",
      request_payload: { platform: "meta", entity_type: entityType, entity_id: entityId, fields: update, pre: pre.ok ? pre.body : null },
      response_payload: { status: result.status, body: result.body },
      success: result.ok,
    });
    return json({ ok: result.ok, response: result.body });
  }

  return json({ error: `unknown action: ${action}` }, 400);
}