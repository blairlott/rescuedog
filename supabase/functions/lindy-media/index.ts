// Lindy-readable flat catalog of image URLs across media_library, media_assets,
// wine_products, and Shopify merch. Auth: shared bearer LINDY_PROXY_TOKEN || LINDY_EXPORT_TOKEN.
// GET /lindy-media?source=library,assets,wine,merch&tag=stockup&subject=dog&min_score=70&limit=500&search=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINDY_TOKEN = Deno.env.get("LINDY_PROXY_TOKEN") ?? Deno.env.get("LINDY_EXPORT_TOKEN");
const SHOPIFY_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN") ?? Deno.env.get("SHOPIFY_DOMAIN");
const SHOPIFY_TOKEN = Deno.env.get("SHOPIFY_STOREFRONT_ACCESS_TOKEN") ?? Deno.env.get("SHOPIFY_STOREFRONT_TOKEN");

const SLACK_CH = "C0B5KT989GT";
const lastPing = new Map<string, number>();

type Item = {
  source: "library" | "assets" | "wine" | "merch";
  id: string; url: string;
  title?: string | null; tags?: string[]; subject?: string | null;
  width?: number | null; height?: number | null; score?: number | null;
  source_url?: string | null;
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

function redact(v: string | null) {
  if (!v) return null;
  if (v.length <= 8) return "***";
  return `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})`;
}

function diag(req: Request, url: URL) {
  const params: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) params[k] = v;
  return {
    endpoint: "lindy-media",
    method: req.method,
    received_headers: {
      authorization: redact(req.headers.get("authorization")),
      "x-api-key": redact(req.headers.get("x-api-key")),
      "user-agent": req.headers.get("user-agent") ?? null,
      "content-type": req.headers.get("content-type") ?? null,
    },
    query_params: params,
    request_id: crypto.randomUUID(),
    at: new Date().toISOString(),
  };
}

async function pingSlack(payload: Record<string, unknown>, dedupeKey: string) {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) return;
  const now = Date.now();
  const prev = lastPing.get(dedupeKey) ?? 0;
  if (now - prev < 60_000) return;
  lastPing.set(dedupeKey, now);
  const text = "⚠️ *lindy-media auth failure* — Lindy/Claude self-diagnose:\n```" + JSON.stringify(payload, null, 2) + "```";
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel: SLACK_CH, text }),
    });
  } catch { /* ignore */ }
}

async function fetchShopifyMerch(tag: string | null, limit: number): Promise<Item[]> {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) return [];
  const q = tag ? `tag:${tag}` : "";
  const query = `query($q:String,$n:Int!){ products(first:$n, query:$q){ edges{ node{ id title handle tags images(first:5){ edges{ node{ url width height altText } } } } } } }`;
  try {
    const r = await fetch(`https://${SHOPIFY_DOMAIN}/api/2025-07/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": SHOPIFY_TOKEN },
      body: JSON.stringify({ query, variables: { q, n: Math.min(limit, 100) } }),
    });
    const data = await r.json();
    const out: Item[] = [];
    for (const e of data?.data?.products?.edges ?? []) {
      const p = e.node;
      for (const ie of p.images.edges) {
        out.push({
          source: "merch", id: `${p.id}:${ie.node.url}`, url: ie.node.url,
          title: p.title, tags: p.tags ?? [], subject: "merch",
          width: ie.node.width ?? null, height: ie.node.height ?? null,
          source_url: `https://${SHOPIFY_DOMAIN}/products/${p.handle}`,
        });
      }
    }
    return out;
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const u = new URL(req.url);
  if (req.method !== "GET") return json({ error: "method_not_allowed", ...diag(req, u) }, 405);

  // Auth with rich diagnostics
  if (!LINDY_TOKEN) {
    return json({ error: "server_misconfigured", reason: "Neither LINDY_PROXY_TOKEN nor LINDY_EXPORT_TOKEN is set on edge function", ...diag(req, u) }, 500);
  }
  const auth = req.headers.get("authorization") ?? "";
  const apiKey = req.headers.get("x-api-key") ?? "";
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : "";
  const presented = bearer || apiKey;

  if (!presented) {
    const body = { error: "unauthorized", reason: "no_credential_presented", missing: ["Authorization: Bearer <LINDY_EXPORT_TOKEN>", "or x-api-key: <LINDY_EXPORT_TOKEN>"], hint: "Add an Authorization header in the form `Bearer <token>` OR x-api-key header. Note: lowercase 'bearer' is accepted but the value must follow.", ...diag(req, u) };
    await pingSlack(body, `lindy-media:nocred:${req.headers.get("user-agent") ?? "unknown"}`);
    return json(body, 401);
  }
  if (presented !== LINDY_TOKEN) {
    const body = { error: "unauthorized", reason: "token_mismatch", presented_token: redact(presented), expected_len: LINDY_TOKEN.length, hint: "Token doesn't match. Verify it's the current LINDY_EXPORT_TOKEN with no leading/trailing whitespace or quotes.", ...diag(req, u) };
    await pingSlack(body, `lindy-media:mismatch:${redact(presented)}`);
    return json(body, 401);
  }

  const sources = (u.searchParams.get("source") ?? "library,assets,wine,merch").split(",").map(s => s.trim()).filter(Boolean);
  const tag = u.searchParams.get("tag");
  const subject = u.searchParams.get("subject");
  const search = u.searchParams.get("search");
  const minScore = Number(u.searchParams.get("min_score") ?? "0");
  const limit = Math.min(parseInt(u.searchParams.get("limit") ?? "200", 10), 1000);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const items: Item[] = [];
  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};

  if (sources.includes("library")) {
    let q = supabase.from("media_library").select("id,title,kind,tags,alt_text,file_url,status").eq("status", "published").limit(limit);
    if (tag) q = q.contains("tags", [tag]);
    if (search) q = q.ilike("title", `%${search}%`);
    const { data, error } = await q;
    if (error) errors.library = error.message;
    for (const r of data ?? []) {
      if (!r.file_url) continue;
      items.push({ source: "library", id: r.id as string, url: r.file_url as string, title: r.title as string, tags: (r.tags as string[]) ?? [], subject: (r.kind as string) ?? null });
    }
    counts.library = data?.length ?? 0;
  }

  if (sources.includes("assets")) {
    let q = supabase.from("media_assets").select("id,image_url,storage_path,width,height,alt_text,ai_tags,ai_subject,ai_score,source_url,status").eq("status", "approved").gte("ai_score", minScore).order("ai_score", { ascending: false, nullsFirst: false }).limit(limit);
    if (tag) q = q.contains("ai_tags", [tag]);
    if (subject) q = q.eq("ai_subject", subject);
    const { data, error } = await q;
    if (error) errors.assets = error.message;
    for (const r of data ?? []) {
      items.push({ source: "assets", id: r.id as string, url: (r.storage_path as string) || (r.image_url as string), title: (r.alt_text as string) ?? null, tags: (r.ai_tags as string[]) ?? [], subject: (r.ai_subject as string) ?? null, width: r.width as number | null, height: r.height as number | null, score: r.ai_score as number | null, source_url: r.source_url as string | null });
    }
    counts.assets = data?.length ?? 0;
  }

  if (sources.includes("wine")) {
    let q = supabase.from("wine_products").select("id,name,image_url,tags").limit(limit);
    if (search) q = q.ilike("name", `%${search}%`);
    const { data, error } = await q;
    if (error) errors.wine = error.message;
    let added = 0;
    for (const r of (data ?? []) as Array<{ id: string; name: string; image_url?: string; tags?: string[] }>) {
      if (!r.image_url) continue;
      const rTags = r.tags ?? [];
      if (tag && !rTags.map(lower).includes(lower(tag))) continue;
      items.push({ source: "wine", id: r.id, url: r.image_url, title: r.name, tags: rTags, subject: "wine" });
      added++;
    }
    counts.wine = added;
  }

  if (sources.includes("merch")) {
    const m = await fetchShopifyMerch(tag, limit);
    items.push(...m);
    counts.merch = m.length;
  }

  return json({ ok: true, count: items.length, sources: counts, errors: Object.keys(errors).length ? errors : undefined, items });
});
