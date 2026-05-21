// Firecrawl-backed blog import. Scrapes rescuedogwines.com/blog (or any
// public blog index), then scrapes each post page, rehosts its cover
// image into the `blog-media` bucket, and upserts into content_index.
//
// Admin-only. Idempotent: re-running updates existing rows by (source, slug).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL = "https://api.firecrawl.dev/v2";

type ScrapeOpts = {
  formats?: any[];
  onlyMainContent?: boolean;
  waitFor?: number;
};

async function fcScrape(url: string, opts: ScrapeOpts = {}) {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) throw new Error("FIRECRAWL_API_KEY missing");
  const r = await fetch(`${FIRECRAWL}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: opts.formats ?? ["markdown", "html", "links"],
      onlyMainContent: opts.onlyMainContent ?? true,
      waitFor: opts.waitFor ?? 2000,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || `firecrawl ${r.status}`);
  // Firecrawl v2 returns either top-level fields or under `data`.
  return j.data ?? j;
}

function slugFromUrl(u: string): string {
  try {
    const parts = new URL(u).pathname.split("/").filter(Boolean);
    return (parts[parts.length - 1] || "").toLowerCase();
  } catch { return ""; }
}

function extractCover(html: string): string | null {
  // 1. og:image
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  if (og) return og[1];
  // 2. first <img> in content
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return img ? img[1] : null;
}

function extractPublished(html: string, mdMeta: any): string | null {
  const m =
    html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i) ||
    html.match(/<time[^>]+datetime=["']([^"']+)/i);
  if (m) return m[1];
  const d = mdMeta?.publishedTime || mdMeta?.datePublished;
  return d ?? null;
}

function extractExcerpt(html: string): string {
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i);
  return m ? m[1].slice(0, 500) : "";
}

function extractAuthor(html: string): string | null {
  const m =
    html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)/i) ||
    html.match(/"author"\s*:\s*{[^}]*"name"\s*:\s*"([^"]+)"/i);
  return m ? m[1] : null;
}

async function rehostImage(srcUrl: string, slug: string, supabase: any): Promise<string | null> {
  try {
    const r = await fetch(srcUrl);
    if (!r.ok) return srcUrl;
    const buf = new Uint8Array(await r.arrayBuffer());
    const ext = (srcUrl.split("?")[0].split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const path = `imported/${slug}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("blog-media").upload(path, buf, {
      contentType: r.headers.get("content-type") || "image/jpeg",
      upsert: true,
    });
    if (error) return srcUrl;
    const { data } = supabase.storage.from("blog-media").getPublicUrl(path);
    return data.publicUrl ?? srcUrl;
  } catch { return srcUrl; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // Admin gate
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const { data: isOwner } = await supabase.rpc("has_role", { _user_id: user.id, _role: "owner" });
  if (!isAdmin && !isOwner) {
    return new Response(JSON.stringify({ error: "admin required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const indexUrl: string = body.index_url || "https://rescuedogwines.com/news/";
  const limit: number = Math.min(Math.max(parseInt(body.limit ?? 50, 10) || 50, 1), 200);

  // 1. Scrape index, collect candidate post URLs
  const index = await fcScrape(indexUrl, { formats: ["links"], onlyMainContent: false, waitFor: 3000 });
  const links: string[] = Array.isArray(index?.links) ? index.links : [];
  const postUrls = Array.from(new Set(
    links
      .filter((u) => typeof u === "string")
      .filter((u) => /rescuedogwines\.com\/(news|blog|stories|post)\//i.test(u))
      .filter((u) => slugFromUrl(u).length > 3)
      .filter((u) => !/\/page\/\d+/i.test(u))
  )).slice(0, limit);

  const results: any[] = [];
  let inserted = 0, updated = 0, failed = 0;

  for (const url of postUrls) {
    try {
      const slug = slugFromUrl(url);
      const page: any = await fcScrape(url, { formats: ["markdown", "html"], onlyMainContent: true, waitFor: 2000 });
      const md: string = page.markdown ?? "";
      const html: string = page.html ?? "";
      const meta: any = page.metadata ?? {};
      const title: string = meta.title || meta.ogTitle || (md.match(/^#\s+(.+)$/m)?.[1] ?? slug);
      const excerpt = meta.description || extractExcerpt(html);
      const author = meta.author || extractAuthor(html);
      const published = extractPublished(html, meta);
      const coverSrc = meta.ogImage || extractCover(html);
      const cover = coverSrc ? await rehostImage(coverSrc, slug, supabase) : null;

      // Convert markdown body to a minimal HTML wrapper. Components already
      // sanitize before render. Internal links rewritten to absolute /blog/<slug> on best effort.
      const bodyHtml = `<div class="imported-wp-post" data-source-url="${url}">${
        // basic md→html via line-level: leave markdown as-is wrapped; the existing
        // BlogPostPage renders content.rendered as HTML. Convert minimal blocks:
        md
          .replace(/^### (.+)$/gm, "<h3>$1</h3>")
          .replace(/^## (.+)$/gm, "<h2>$1</h2>")
          .replace(/^# (.+)$/gm, "<h1>$1</h1>")
          .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
          // Internal link rewrites: blog/news → /blog/<slug>
          .replace(/\[([^\]]+)\]\(https?:\/\/(?:www\.)?rescuedogwines\.com\/(?:news|blog|post|stories)\/([^)\s/]+)\/?\)/g, '<a href="/blog/$2">$1</a>')
          // mission/about/shop/wines/contact → relative
          .replace(/\[([^\]]+)\]\(https?:\/\/(?:www\.)?rescuedogwines\.com\/(mission|about|shop|wines|contact|store-locator|wine-club|the-pack)\/?([^)\s]*)\)/g, '<a href="/$2$3">$1</a>')
          // wine product → /shop/<sku|slug>
          .replace(/\[([^\]]+)\]\(https?:\/\/(?:www\.)?rescuedogwines\.com\/product\/([^)\s/]+)\/?\)/g, '<a href="/shop/$2">$1</a>')
          // any remaining link stays absolute
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
          .replace(/\n{2,}/g, "</p><p>")
          .replace(/^/, "<p>") + "</p>"
      }</div>`;

      const { data: existing } = await supabase
        .from("content_index")
        .select("id")
        .eq("source", "wordpress")
        .eq("slug", slug)
        .maybeSingle();

      const row = {
        source: "wordpress",
        external_id: url,
        slug,
        type: "post",
        title,
        excerpt,
        body_html: bodyHtml,
        cover_image_url: cover,
        author,
        published_at: published,
        is_public: true,
        raw: { source_url: url, scraped_at: new Date().toISOString() },
        synced_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("content_index").upsert(row, { onConflict: "source,slug" });
      if (error) { failed++; results.push({ url, ok: false, error: error.message }); continue; }

      // Write 301 redirect from legacy /news/<slug> path → /blog/<slug>
      try {
        const fromPath = new URL(url).pathname.replace(/\/$/, "");
        const toPath = `/blog/${slug}`;
        if (fromPath && fromPath !== toPath) {
          await supabase.from("content_redirects").upsert(
            { from_path: fromPath, to_path: toPath, status_code: 301, source: "firecrawl_blog_import" },
            { onConflict: "from_path" },
          );
        }
      } catch { /* non-fatal */ }

      if (existing) updated++; else inserted++;
      results.push({ url, slug, ok: true });
    } catch (e: any) {
      failed++;
      results.push({ url, ok: false, error: e?.message ?? String(e) });
    }
  }

  return new Response(JSON.stringify({
    index_url: indexUrl,
    scraped: postUrls.length,
    inserted, updated, failed,
    results,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});