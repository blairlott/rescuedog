// Autonomous keyword generator + optimizer for Google Ads & Instacart Ads.
// Generates ideas from 4 sources (AI, Google Plan, Semrush, search-term reports),
// scores them deterministically, auto-applies safe ones, gates risky ones.
// Auth: ad ops / admin / owner only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GOOGLE_ADS_VERSION = "v18";
const INSTACART_BASE = "https://api.ads.instacart.com/api/v3";
const INSTACART_TOKEN_URL = "https://api.ads.instacart.com/oauth/token";
const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- token helpers ----------
let _gTok: { token: string; exp: number } | null = null;
async function googleAccessToken(): Promise<string | null> {
  if (_gTok && _gTok.exp > Date.now() + 30_000) return _gTok.token;
  const cid = Deno.env.get("GOOGLE_ADS_CLIENT_ID");
  const cs = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET");
  const rt = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
  if (!cid || !cs || !rt) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cid, client_secret: cs, refresh_token: rt, grant_type: "refresh_token" }).toString(),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b?.access_token) return null;
  _gTok = { token: b.access_token, exp: Date.now() + (Number(b.expires_in ?? 3600) * 1000) };
  return _gTok.token;
}
function googleHeaders(tok: string) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${tok}`,
    "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
    "Content-Type": "application/json",
  };
  const login = (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replace(/-/g, "");
  if (login) h["login-customer-id"] = login;
  return h;
}

let _icTok: { token: string; exp: number } | null = null;
async function instacartAccessToken(): Promise<string | null> {
  if (_icTok && _icTok.exp > Date.now() + 30_000) return _icTok.token;
  const directToken = Deno.env.get("INSTACART_ADS_API_TOKEN") || Deno.env.get("INSTACART_ADS_TOKEN");
  if (directToken) return directToken;

  const cid = Deno.env.get("INSTACART_ADS_CLIENT_ID");
  const cs = Deno.env.get("INSTACART_ADS_CLIENT_SECRET");
  const rt = Deno.env.get("INSTACART_ADS_REFRESH_TOKEN");
  if (!cid || !cs || !rt) return null;
  const r = await fetch(INSTACART_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: cid, client_secret: cs, refresh_token: rt }).toString(),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b?.access_token) return null;
  _icTok = { token: b.access_token, exp: Date.now() + (Number(b.expires_in ?? 3600) * 1000) };
  return _icTok.token;
}

// ---------- source: AI seeds ----------
async function aiKeywordSeeds(brandTokens: string[], existing: string[]): Promise<Array<{ keyword: string; reasoning: string }>> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return [];
  const sys = "You generate high-intent paid-search keywords for a small US winery that donates to dog rescues. Output ONLY a JSON array of objects with shape {keyword:string,reasoning:string}. 12–20 entries. 2–5 words each. No brand misuse, no trademarks, no medical claims, no alcohol-restricted terms.";
  const usr = `Brand/product tokens to draw from: ${brandTokens.slice(0, 30).join(", ")}.\nKeywords already running (avoid duplicates): ${existing.slice(0, 50).join(", ") || "(none)"}.\nFocus on commercial intent (buy, order, ship, gift, club, sampler) blended with rescue-mission affinity. Mix branded and non-branded.`;
  try {
    const r = await fetch(LOVABLE_GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
        response_format: { type: "json_object" },
      }),
    });
    const b = await r.json().catch(() => ({}));
    const raw = b?.choices?.[0]?.message?.content ?? "[]";
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (parsed.keywords ?? parsed.items ?? []);
    return (Array.isArray(arr) ? arr : [])
      .map((x: any) => ({ keyword: String(x.keyword ?? x.term ?? "").trim().toLowerCase(), reasoning: String(x.reasoning ?? "AI seed").slice(0, 160) }))
      .filter((x: any) => x.keyword && x.keyword.split(/\s+/).length <= 6);
  } catch (e) {
    console.warn("ai seeds failed", e);
    return [];
  }
}

// ---------- source: Google Keyword Plan Idea ----------
async function googleKeywordIdeas(seeds: string[]): Promise<Array<{ keyword: string; volume: number; competition: string; cpc_micros: number | null }>> {
  if (seeds.length === 0) return [];
  const tok = await googleAccessToken();
  const cust = (Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "").replace(/-/g, "");
  if (!tok || !cust) return [];
  try {
    const res = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cust}:generateKeywordIdeas`,
      {
        method: "POST",
        headers: googleHeaders(tok),
        body: JSON.stringify({
          language: "languageConstants/1000",
          geoTargetConstants: ["geoTargetConstants/2840"],
          keywordPlanNetwork: "GOOGLE_SEARCH",
          keywordSeed: { keywords: seeds.slice(0, 20) },
        }),
      },
    );
    const b = await res.json().catch(() => ({}));
    const results = b?.results ?? [];
    return results.slice(0, 30).map((r: any) => ({
      keyword: String(r.text ?? "").toLowerCase(),
      volume: Number(r.keywordIdeaMetrics?.avgMonthlySearches ?? 0),
      competition: String(r.keywordIdeaMetrics?.competition ?? "UNSPECIFIED"),
      cpc_micros: r.keywordIdeaMetrics?.highTopOfPageBidMicros ? Number(r.keywordIdeaMetrics.highTopOfPageBidMicros) : null,
    })).filter((x: any) => x.keyword);
  } catch (e) {
    console.warn("google plan failed", e);
    return [];
  }
}

// ---------- source: Google search-term report ----------
async function googleSearchTerms(adGroupId: string): Promise<Array<{ keyword: string; clicks: number; cost_micros: number; conversions: number }>> {
  const tok = await googleAccessToken();
  const cust = (Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "").replace(/-/g, "");
  if (!tok || !cust) return [];
  const query = `SELECT search_term_view.search_term, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM search_term_view
    WHERE segments.date DURING LAST_30_DAYS
      AND ad_group.id = ${adGroupId}
    ORDER BY metrics.cost_micros DESC
    LIMIT 100`;
  try {
    const r = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cust}/googleAds:search`,
      { method: "POST", headers: googleHeaders(tok), body: JSON.stringify({ query }) },
    );
    const b = await r.json().catch(() => ({}));
    const rows = b?.results ?? [];
    return rows.map((row: any) => ({
      keyword: String(row?.searchTermView?.searchTerm ?? "").toLowerCase(),
      clicks: Number(row?.metrics?.clicks ?? 0),
      cost_micros: Number(row?.metrics?.costMicros ?? 0),
      conversions: Number(row?.metrics?.conversions ?? 0),
    })).filter((x: any) => x.keyword);
  } catch (e) {
    console.warn("google search terms failed", e);
    return [];
  }
}

// ---------- source: Semrush ----------
async function semrushRelated(seed: string): Promise<Array<{ keyword: string; volume: number; cpc_micros: number | null }>> {
  const key = Deno.env.get("SEMRUSH_API_KEY");
  if (!key) return [];
  try {
    const url = `https://api.semrush.com/?type=phrase_related&key=${key}&phrase=${encodeURIComponent(seed)}&database=us&export_columns=Ph,Nq,Cp&display_limit=15`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const text = await r.text();
    const lines = text.trim().split("\n").slice(1); // skip header
    return lines.map(line => {
      const [ph, nq, cp] = line.split(";");
      return {
        keyword: String(ph ?? "").toLowerCase(),
        volume: Number(nq ?? 0),
        cpc_micros: cp ? Math.round(Number(cp) * 1_000_000) : null,
      };
    }).filter(x => x.keyword);
  } catch (e) {
    console.warn("semrush failed", e);
    return [];
  }
}

// ---------- scoring ----------
function scoreKeyword(opts: {
  source: string;
  volume?: number;
  cpc_micros?: number | null;
  default_bid_micros?: number | null;
  competition?: string;
  conversions?: number;
  hasBrandToken?: boolean;
}): number {
  let s = 0;
  if (opts.source === "search_term" && (opts.conversions ?? 0) > 0) s += 40;
  if (opts.source === "search_term") s += 10;
  if (opts.volume !== undefined && opts.volume >= 100 && opts.volume <= 10000) s += 30;
  else if (opts.volume !== undefined && opts.volume > 10000 && opts.volume <= 50000) s += 15;
  if (opts.cpc_micros && opts.default_bid_micros && opts.cpc_micros <= opts.default_bid_micros * 1.2) s += 20;
  if (opts.hasBrandToken) s += 10;
  if ((opts.competition ?? "").toUpperCase() === "HIGH" && (opts.conversions ?? 0) === 0) s -= 30;
  return Math.max(0, Math.min(100, s));
}

// ---------- apply: Google ----------
async function googleAddKeyword(customerId: string, adGroupId: string, keyword: string, matchType: string, bidMicros: number | null) {
  const tok = await googleAccessToken();
  if (!tok) return { ok: false, error: "google token failed" };
  const cid = customerId.replace(/-/g, "");
  const op: any = {
    create: {
      adGroup: `customers/${cid}/adGroups/${adGroupId}`,
      status: "ENABLED",
      keyword: { text: keyword, matchType: matchType.toUpperCase() },
    },
  };
  if (bidMicros) op.create.cpcBidMicros = bidMicros;
  const r = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cid}/adGroupCriteria:mutate`, {
    method: "POST", headers: googleHeaders(tok), body: JSON.stringify({ operations: [op] }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: b?.error?.message ?? `HTTP ${r.status}`, body: b };
  return { ok: true, resourceName: b?.results?.[0]?.resourceName, body: b };
}

async function googleAddNegative(customerId: string, adGroupId: string, keyword: string) {
  const tok = await googleAccessToken();
  if (!tok) return { ok: false, error: "google token failed" };
  const cid = customerId.replace(/-/g, "");
  const op = {
    create: {
      adGroup: `customers/${cid}/adGroups/${adGroupId}`,
      negative: true,
      keyword: { text: keyword, matchType: "PHRASE" },
    },
  };
  const r = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cid}/adGroupCriteria:mutate`, {
    method: "POST", headers: googleHeaders(tok), body: JSON.stringify({ operations: [op] }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: b?.error?.message ?? `HTTP ${r.status}`, body: b };
  return { ok: true, resourceName: b?.results?.[0]?.resourceName, body: b };
}

// ---------- apply: Instacart ----------
async function instacartAddKeyword(adGroupId: string, keyword: string, matchType: string, bid: number | null, advertiserId: string) {
  const tok = await instacartAccessToken();
  if (!tok) return { ok: false, error: "instacart token failed" };
  const payload: any = {
    ad_group_id: adGroupId,
    keyword,
    match_type: matchType,
  };
  if (bid) payload.bid = bid;
  const r = await fetch(`${INSTACART_BASE}/keywords`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
      "Instacart-Ads-Advertiser-Id": advertiserId,
    },
    body: JSON.stringify(payload),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: b?.error?.message ?? b?.message ?? `HTTP ${r.status}`, body: b };
  return { ok: true, resourceName: String(b?.id ?? b?.keyword_id ?? ""), body: b };
}

// ---------- main handler ----------
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
  const { data: isOk } = await userClient.rpc("is_ad_ops", { _user_id: userId });
  if (!isOk) return json({ error: "forbidden" }, 403);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const action = String(body?.action ?? "");
  const platform = String(body?.platform ?? "").toLowerCase();

  // ---- list ----
  if (action === "list") {
    const adGroupId = String(body?.ad_group_id ?? "");
    if (!adGroupId) return json({ error: "ad_group_id required" }, 400);
    const { data, error } = await admin
      .from("kennel_keyword_ideas")
      .select("*")
      .eq("platform", platform).eq("ad_group_id", adGroupId)
      .order("score", { ascending: false }).limit(200);
    if (error) return json({ error: error.message }, 500);
    const { data: settings } = await admin.from("kennel_keyword_settings").select("*").eq("platform", platform).maybeSingle();
    return json({ ok: true, ideas: data ?? [], settings });
  }

  // ---- update_settings ----
  if (action === "update_settings") {
    const fields = body?.fields ?? {};
    const { data, error } = await admin
      .from("kennel_keyword_settings")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("platform", platform).select().maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, settings: data });
  }

  // ---- generate ----
  if (action === "generate") {
    const campaignId = String(body?.campaign_id ?? "");
    const adGroupId = String(body?.ad_group_id ?? "");
    if (!adGroupId) return json({ error: "ad_group_id required" }, 400);

    // Pull brand tokens from wine_products
    const { data: wines } = await admin.from("wine_products").select("name,varietal,vintage").limit(80);
    const brandTokens = Array.from(new Set((wines ?? []).flatMap((w: any) =>
      [w.name, w.varietal, w.vintage].filter(Boolean).map((s: any) => String(s).toLowerCase())
    ))).slice(0, 60);

    // Existing keywords (already-generated) to avoid dupes
    const { data: existingRows } = await admin
      .from("kennel_keyword_ideas")
      .select("keyword")
      .eq("platform", platform).eq("ad_group_id", adGroupId);
    const existing = (existingRows ?? []).map((r: any) => r.keyword);

    // Get sources in parallel
    const aiP = aiKeywordSeeds(brandTokens, existing);
    const semrushP = brandTokens.length ? semrushRelated(brandTokens[0]) : Promise.resolve([]);
    const searchTermsP = platform === "google" ? googleSearchTerms(adGroupId) : Promise.resolve([]);
    const [aiSeeds, semrushIdeas, searchTerms] = await Promise.all([aiP, semrushP, searchTermsP]);

    // Google plan ideas seeded with AI + brand
    const planSeeds = Array.from(new Set([...aiSeeds.map(s => s.keyword), ...brandTokens.slice(0, 6)])).slice(0, 20);
    const planIdeas = platform === "google" ? await googleKeywordIdeas(planSeeds) : [];

    const toInsert: any[] = [];
    const seen = new Set(existing.map(k => k.toLowerCase()));

    const hasBrand = (kw: string) => brandTokens.some(t => t && kw.includes(t));

    for (const s of aiSeeds) {
      if (!s.keyword || seen.has(s.keyword)) continue;
      seen.add(s.keyword);
      const score = scoreKeyword({ source: "ai", hasBrandToken: hasBrand(s.keyword) });
      toInsert.push({
        platform, campaign_id: campaignId, ad_group_id: adGroupId, keyword: s.keyword,
        match_type: "phrase", source: "ai", score: score + 30, // AI seeds aren't backed by data, give baseline lift
        recommended_action: "add", reasoning: s.reasoning, status: "pending",
      });
    }
    for (const p of planIdeas) {
      if (!p.keyword || seen.has(p.keyword)) continue;
      seen.add(p.keyword);
      const score = scoreKeyword({ source: "google_plan", volume: p.volume, competition: p.competition, cpc_micros: p.cpc_micros, hasBrandToken: hasBrand(p.keyword) });
      toInsert.push({
        platform, campaign_id: campaignId, ad_group_id: adGroupId, keyword: p.keyword,
        match_type: "phrase", source: "google_plan", score,
        recommended_action: "add", recommended_bid_micros: p.cpc_micros,
        volume: p.volume, cpc_micros: p.cpc_micros, competition: p.competition,
        reasoning: `~${p.volume.toLocaleString()}/mo searches, ${p.competition} competition`,
        status: "pending",
      });
    }
    for (const s of semrushIdeas) {
      if (!s.keyword || seen.has(s.keyword)) continue;
      seen.add(s.keyword);
      const score = scoreKeyword({ source: "semrush", volume: s.volume, cpc_micros: s.cpc_micros, hasBrandToken: hasBrand(s.keyword) });
      toInsert.push({
        platform, campaign_id: campaignId, ad_group_id: adGroupId, keyword: s.keyword,
        match_type: "phrase", source: "semrush", score,
        recommended_action: "add", recommended_bid_micros: s.cpc_micros,
        volume: s.volume, cpc_micros: s.cpc_micros,
        reasoning: `Semrush related (vol ${s.volume.toLocaleString()})`,
        status: "pending",
      });
    }
    // Search terms: high-converters → add; spent-with-zero-conv → negative
    for (const t of searchTerms) {
      if (!t.keyword || seen.has(t.keyword)) continue;
      seen.add(t.keyword);
      if (t.conversions > 0) {
        const score = scoreKeyword({ source: "search_term", conversions: t.conversions, hasBrandToken: hasBrand(t.keyword) });
        toInsert.push({
          platform, campaign_id: campaignId, ad_group_id: adGroupId, keyword: t.keyword,
          match_type: "exact", source: "search_term", score,
          recommended_action: "add",
          reasoning: `${t.conversions} conv, ${t.clicks} clicks (last 30d)`,
          status: "pending",
        });
      } else if (t.cost_micros >= 20_000_000) {
        // ≥ $20 spend, 0 conversions → negative candidate
        toInsert.push({
          platform, campaign_id: campaignId, ad_group_id: adGroupId, keyword: t.keyword,
          match_type: "phrase", source: "search_term", score: 80,
          recommended_action: "negative",
          reasoning: `$${(t.cost_micros / 1_000_000).toFixed(2)} spent, 0 conversions`,
          status: "pending",
        });
      }
    }

    // Apply settings → bucket into pending vs awaiting_approval
    const { data: settings } = await admin.from("kennel_keyword_settings").select("*").eq("platform", platform).maybeSingle();
    const autoApply = settings?.auto_apply !== false;
    for (const row of toInsert) {
      if (!autoApply) { row.status = "awaiting_approval"; continue; }
      if (row.recommended_action === "add" && row.score < 70) row.status = "awaiting_approval";
      if (row.recommended_action === "add" && (row.volume ?? 0) > 50000) row.status = "awaiting_approval";
    }

    // Insert (ignore dupes from unique index)
    let inserted = 0;
    if (toInsert.length) {
      const { data, error } = await admin
        .from("kennel_keyword_ideas")
        .upsert(toInsert, { onConflict: "platform,ad_group_id,keyword,match_type,recommended_action", ignoreDuplicates: true })
        .select("id");
      if (error) return json({ error: error.message }, 500);
      inserted = data?.length ?? 0;
    }

    return json({
      ok: true,
      counts: {
        ai: aiSeeds.length, google_plan: planIdeas.length, semrush: semrushIdeas.length, search_terms: searchTerms.length,
        inserted, generated: toInsert.length,
      },
    });
  }

  // ---- apply (single) ----
  if (action === "apply" || action === "reject") {
    const ideaId = String(body?.idea_id ?? "");
    if (!ideaId) return json({ error: "idea_id required" }, 400);
    const { data: idea, error } = await admin.from("kennel_keyword_ideas").select("*").eq("id", ideaId).maybeSingle();
    if (error || !idea) return json({ error: error?.message ?? "not found" }, 404);

    if (action === "reject") {
      await admin.from("kennel_keyword_ideas").update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", ideaId);
      return json({ ok: true, status: "rejected" });
    }

    let result: { ok: boolean; resourceName?: string; error?: string; body?: any } = { ok: false };
    if (idea.platform === "google") {
      const cust = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "";
      if (idea.recommended_action === "add") {
        result = await googleAddKeyword(cust, idea.ad_group_id, idea.keyword, idea.match_type, idea.recommended_bid_micros);
      } else if (idea.recommended_action === "negative") {
        result = await googleAddNegative(cust, idea.ad_group_id, idea.keyword);
      } else {
        return json({ error: `action ${idea.recommended_action} not implemented for google v1` }, 400);
      }
    } else if (idea.platform === "instacart") {
      const advertiserId = Deno.env.get("INSTACART_ADS_ADVERTISER_ID") ?? "";
      if (idea.recommended_action === "add") {
        result = await instacartAddKeyword(idea.ad_group_id, idea.keyword, idea.match_type, idea.recommended_bid_micros ? idea.recommended_bid_micros / 1_000_000 : null, advertiserId);
      } else {
        return json({ error: `action ${idea.recommended_action} not yet supported for instacart` }, 400);
      }
    }

    await admin.from("kennel_keyword_ideas").update({
      status: result.ok ? "applied" : "failed",
      executed_resource_name: result.resourceName ?? null,
      execution_response: result.body ? { status: result.ok ? "ok" : "fail", body: result.body, error: result.error } : null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", ideaId);

    await admin.from("ad_execution_log").insert({
      recommendation_id: null,
      action: idea.recommended_action,
      actor_id: userId,
      actor_kind: "user",
      request_payload: { platform: idea.platform, keyword: idea.keyword, ad_group_id: idea.ad_group_id, match_type: idea.match_type, source: idea.source },
      response_payload: { resource: result.resourceName, body: result.body, error: result.error },
      success: result.ok,
    });

    return json({ ok: result.ok, error: result.error });
  }

  return json({ error: `unknown action: ${action}` }, 400);
});