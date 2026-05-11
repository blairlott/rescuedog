import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Imports posts/pages/events/any custom post type from a self-hosted WordPress
 * site (Cloudways) via the public WP REST API. No auth required for published
 * content. Re-hosts featured images into Lovable storage so we can sunset
 * Cloudways without breaking image links. Writes 301 redirects from the old
 * WordPress URLs to the new Lovable paths.
 */
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
    const { data: ok } = await supabase.rpc("is_cms_editor", { _user_id: user.id });
    if (!ok) {
      const { data: admin } = await supabase.rpc("is_admin_or_owner", { _user_id: user.id });
      if (!admin) return json({ error: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const siteUrl: string = (body.site_url ?? "").replace(/\/+$/, "");
    const postType: string = body.post_type ?? "posts"; // posts | pages | events | tribe_events | <custom>
    const targetType: string = body.target_type ?? (postType === "pages" ? "page" : postType.includes("event") ? "event" : "post");
    const targetPathPrefix: string = body.target_prefix ?? (targetType === "event" ? "/events" : targetType === "page" ? "" : "/blog");
    const downloadImages: boolean = body.download_images !== false;
    const writeRedirects: boolean = body.write_redirects !== false;

    if (!siteUrl) return json({ error: "site_url required" }, 400);

    const { data: run } = await supabase.from("wp_import_runs").insert({
      source_url: siteUrl, post_type: postType, started_by: user.id,
    }).select("id").single();
    const runId = run!.id;

    let imported = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    // Paginate WP REST endpoint
    let page = 1;
    while (true) {
      const url = `${siteUrl}/wp-json/wp/v2/${postType}?per_page=50&page=${page}&_embed=1&status=publish`;
      const resp = await fetch(url, { headers: { "User-Agent": "RescueDog-LovableImporter/1.0" } });
      if (resp.status === 400 && page > 1) break; // WP returns 400 past last page
      if (!resp.ok) {
        errors.push(`page ${page}: HTTP ${resp.status}`);
        break;
      }
      const items: any[] = await resp.json();
      if (!items || items.length === 0) break;

      for (const item of items) {
        try {
          const slug: string = item.slug;
          const title: string = (item.title?.rendered ?? "").replace(/<[^>]+>/g, "").trim();
          const bodyHtml: string = item.content?.rendered ?? "";
          const excerpt: string = (item.excerpt?.rendered ?? "").replace(/<[^>]+>/g, "").trim();
          const author = item._embedded?.author?.[0]?.name ?? null;
          const publishedAt = item.date_gmt ? new Date(item.date_gmt + "Z").toISOString() : null;
          const tags: string[] = (item._embedded?.["wp:term"] ?? [])
            .flat().filter((t: any) => t?.taxonomy === "post_tag" || t?.taxonomy === "category")
            .map((t: any) => t.name);

          // Featured image — download + re-host
          let coverUrl: string | null = null;
          const remoteImg = item._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null;
          if (remoteImg && downloadImages) {
            try {
              const imgRes = await fetch(remoteImg);
              if (imgRes.ok) {
                const buf = new Uint8Array(await imgRes.arrayBuffer());
                const ext = remoteImg.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
                const path = `${targetType}/${slug}-${item.id}.${ext}`;
                const ct = imgRes.headers.get("content-type") ?? `image/${ext}`;
                const { error: upErr } = await supabase.storage.from("blog-media").upload(path, buf, { contentType: ct, upsert: true });
                if (!upErr) {
                  const { data: pub } = supabase.storage.from("blog-media").getPublicUrl(path);
                  coverUrl = pub.publicUrl;
                } else {
                  coverUrl = remoteImg; // fall back to remote if upload fails
                }
              } else {
                coverUrl = remoteImg;
              }
            } catch {
              coverUrl = remoteImg;
            }
          } else {
            coverUrl = remoteImg;
          }

          // Upsert into content_index by source + external_id
          const { error: insErr } = await supabase.from("content_index").upsert({
            source: "wordpress",
            external_id: String(item.id),
            type: targetType,
            slug,
            title,
            excerpt: excerpt || null,
            body_html: bodyHtml,
            author,
            cover_image_url: coverUrl,
            tags,
            published_at: publishedAt,
            is_public: true,
            raw: item,
            synced_at: new Date().toISOString(),
          }, { onConflict: "source,external_id" } as any);

          if (insErr) { failed++; errors.push(`${slug}: ${insErr.message}`); continue; }

          // 301 redirect from old WP URL → new Lovable path
          if (writeRedirects && item.link) {
            try {
              const u = new URL(item.link);
              const fromPath = u.pathname.replace(/\/+$/, "") || "/";
              const toPath = `${targetPathPrefix}/${slug}`.replace(/\/+/g, "/");
              if (fromPath !== toPath) {
                await supabase.from("content_redirects").upsert({ from_path: fromPath, to_path: toPath }, { onConflict: "from_path" } as any);
              }
            } catch { /* ignore bad URLs */ }
          }

          imported++;
        } catch (e) {
          failed++; errors.push(String(e));
        }
      }

      if (items.length < 50) break;
      page++;
      if (page > 100) break; // hard safety cap (5000 items)
    }

    await supabase.from("wp_import_runs").update({
      status: errors.length && imported === 0 ? "failed" : "complete",
      imported_count: imported, skipped_count: skipped, failed_count: failed,
      error_log: errors.length ? errors.slice(0, 50).join("\n") : null,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    return json({ ok: true, runId, imported, failed, errors: errors.slice(0, 10) });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  function json(b: any, status = 200) {
    return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});