// Refreshes title/excerpt/author/published_at/cover_image_url on
// content_index rows imported from WordPress, by re-fetching the canonical
// /wp-json/wp/v2/posts?slug=<slug>&_embed=1 payload. Fixes rows where the
// initial Firecrawl-based import captured the age-gate document <title>
// instead of the real article H1.
//
// Admin/CMS-editor only. Idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  try {
    const { data: u } = await supabase.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "unauthenticated" }, 401);
    const { data: editor } = await supabase.rpc("is_cms_editor", { _user_id: user.id });
    if (!editor) {
      const { data: admin } = await supabase.rpc("is_admin_or_owner", { _user_id: user.id });
      if (!admin) return json({ error: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const siteUrl: string = (body.site_url ?? "https://rescuedogwines.com").replace(/\/+$/, "");
    const onlyMangled: boolean = body.only_mangled ?? false;
    const downloadImages: boolean = body.download_images !== false;

    let query = supabase.from("content_index").select("id, slug, type, title, cover_image_url").eq("source", "wordpress");
    if (onlyMangled) query = query.ilike("title", "%Age Verification%");
    const { data: rows, error: selErr } = await query;
    if (selErr) return json({ error: selErr.message }, 500);

    let updated = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const row of rows ?? []) {
      try {
        const postType = row.type === "page" ? "pages" : row.type === "event" ? "tribe_events" : "posts";
        const url = `${siteUrl}/wp-json/wp/v2/${postType}?slug=${encodeURIComponent(row.slug)}&_embed=1`;
        const resp = await fetch(url, { headers: { "User-Agent": "RescueDog-LovableImporter/1.0" } });
        if (!resp.ok) { failed++; errors.push(`${row.slug}: HTTP ${resp.status}`); continue; }
        const items = await resp.json();
        const item = Array.isArray(items) ? items[0] : null;
        if (!item) { skipped++; continue; }

        const newTitle = decodeEntities(stripTags(item.title?.rendered ?? "")).trim();
        const newExcerpt = decodeEntities(stripTags(item.excerpt?.rendered ?? "")).trim();
        const author = item._embedded?.author?.[0]?.name ?? null;
        const publishedAt = item.date_gmt ? new Date(item.date_gmt + "Z").toISOString() : null;
        const externalId = item.id ? String(item.id) : null;

        // Image re-host (only if current cover isn't already in our bucket)
        let coverUrl: string | null = row.cover_image_url;
        const remoteImg: string | null = item._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null;
        const isLocal = !!coverUrl && coverUrl.includes("/storage/v1/object/public/blog-media/");
        if (remoteImg && downloadImages && !isLocal) {
          try {
            const imgRes = await fetch(remoteImg);
            if (imgRes.ok) {
              const buf = new Uint8Array(await imgRes.arrayBuffer());
              const ext = remoteImg.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
              const path = `${row.type}/${row.slug}-${item.id}.${ext}`;
              const ct = imgRes.headers.get("content-type") ?? `image/${ext}`;
              const { error: upErr } = await supabase.storage.from("blog-media").upload(path, buf, { contentType: ct, upsert: true });
              if (!upErr) {
                const { data: pub } = supabase.storage.from("blog-media").getPublicUrl(path);
                coverUrl = pub.publicUrl;
              } else {
                coverUrl = remoteImg;
              }
            }
          } catch { /* keep existing coverUrl */ }
        }

        const patch: Record<string, unknown> = {
          title: newTitle || row.title,
          excerpt: newExcerpt || null,
          author,
          published_at: publishedAt,
          cover_image_url: coverUrl,
          synced_at: new Date().toISOString(),
        };
        if (externalId) patch.external_id = externalId;

        const { error: updErr } = await supabase.from("content_index").update(patch).eq("id", row.id);
        if (updErr) { failed++; errors.push(`${row.slug}: ${updErr.message}`); continue; }
        updated++;
      } catch (e) {
        failed++; errors.push(`${row.slug}: ${String(e)}`);
      }
    }

    return json({ ok: true, total: rows?.length ?? 0, updated, skipped, failed, errors });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});