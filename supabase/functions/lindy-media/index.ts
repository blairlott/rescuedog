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

type Item = {
  source: "library" | "assets" | "wine" | "merch";
  id: string;
  url: string;
  title?: string | null;
  tags?: string[];
  subject?: string | null;
  width?: number | null;
  height?: number | null;
  score?: number | null;
  source_url?: string | null;
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

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
          source: "merch",
          id: `${p.id}:${ie.node.url}`,
          url: ie.node.url,
          title: p.title,
          tags: p.tags ?? [],
          subject: "merch",
          width: ie.node.width ?? null,
          height: ie.node.height ?? null,
          source_url: `https://${SHOPIFY_DOMAIN}/products/${p.handle}`,
        });
      }
    }
    return out;
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("authorization") ?? "";
  const apiKey = req.headers.get("x-api-key") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const ok = !!LINDY_TOKEN && (bearer === LINDY_TOKEN || apiKey === LINDY_TOKEN);
  if (!ok) return json({ error: "unauthorized" }, 401);

  const u = new URL(req.url);
  const sources = (u.searchParams.get("source") ?? "library,assets,wine,merch").split(",").map(s => s.trim()).filter(Boolean);
  const tag = u.searchParams.get("tag");
  const subject = u.searchParams.get("subject");
  const search = u.searchParams.get("search");
  const minScore = Number(u.searchParams.get("min_score") ?? "0");
  const limit = Math.min(parseInt(u.searchParams.get("limit") ?? "200", 10), 1000);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const items: Item[] = [];
  const counts: Record<string, number> = {};

  if (sources.includes("library")) {
    let q = supabase.from("media_library").select("id,title,kind,tags,alt_text,file_url,status").eq("status", "published").limit(limit);
    if (tag) q = q.contains("tags", [tag]);
    if (search) q = q.ilike("title", `%${search}%`);
    const { data } = await q;
    for (const r of data ?? []) {
      if (!r.file_url) continue;
      items.push({
        source: "library",
        id: r.id as string,
        url: r.file_url as string,
        title: r.title as string,
        tags: (r.tags as string[]) ?? [],
        subject: (r.kind as string) ?? null,
      });
    }
    counts.library = data?.length ?? 0;
  }

  if (sources.includes("assets")) {
    let q = supabase.from("media_assets").select("id,image_url,storage_path,width,height,alt_text,ai_tags,ai_subject,ai_score,source_url,status").eq("status", "approved").gte("ai_score", minScore).order("ai_score", { ascending: false, nullsFirst: false }).limit(limit);
    if (tag) q = q.contains("ai_tags", [tag]);
    if (subject) q = q.eq("ai_subject", subject);
    const { data } = await q;
    for (const r of data ?? []) {
      items.push({
        source: "assets",
        id: r.id as string,
        url: (r.storage_path as string) || (r.image_url as string),
        title: (r.alt_text as string) ?? null,
        tags: (r.ai_tags as string[]) ?? [],
        subject: (r.ai_subject as string) ?? null,
        width: r.width as number | null,
        height: r.height as number | null,
        score: r.ai_score as number | null,
        source_url: r.source_url as string | null,
      });
    }
    counts.assets = data?.length ?? 0;
  }

  if (sources.includes("wine")) {
    let q = supabase.from("wine_products").select("id,name,image_url,tags").limit(limit);
    if (search) q = q.ilike("name", `%${search}%`);
    const { data } = await q;
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

  return json({ ok: true, count: items.length, sources: counts, items });
});
