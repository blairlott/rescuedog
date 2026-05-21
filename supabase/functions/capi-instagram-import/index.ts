import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY")!;
const KENNEL_SECRET = Deno.env.get("KENNEL_EXTERNAL_SIGNAL_SECRET");

const DEFAULT_HANDLE = "rescuedogwines";
const DEFAULT_LIMIT = 12;

type ExtractedPost = {
  image_url?: string;
  video_url?: string;
  caption?: string;
  permalink?: string;
};

class UnsupportedSiteError extends Error {
  constructor(message: string) { super(message); this.name = "UnsupportedSiteError"; }
}

async function firecrawlExtract(targetUrl: string, limit: number): Promise<ExtractedPost[]> {
  const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: targetUrl,
      onlyMainContent: false,
      waitFor: 3500,
      formats: [
        {
          type: "json",
          prompt: `Extract up to ${limit} most recent Instagram posts and reels from this profile page. For each, return: image_url (direct .jpg/.jpeg/.png/.webp asset URL — NOT a thumbnail data URI, used as poster for videos too), video_url (direct .mp4 asset URL if this is a Reel or video post, otherwise null), caption text if visible, and permalink (https://www.instagram.com/p/SHORTCODE/ or /reel/SHORTCODE/). Return items that have at least an image_url or video_url. JSON: { "posts": [...] }.`,
        },
        "links",
      ],
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    if (r.status === 403) {
      throw new UnsupportedSiteError(`Firecrawl cannot access Instagram directly: ${text.slice(0, 200)}`);
    }
    throw new Error(`firecrawl ${r.status}: ${text.slice(0, 400)}`);
  }
  const data = await r.json();
  const json = data?.data?.json ?? data?.json ?? {};
  const posts: ExtractedPost[] = Array.isArray(json?.posts) ? json.posts : [];

  // Fallback: if extraction missed, mine links for image + video assets from instagram CDN
  if (posts.length === 0) {
    const links: string[] = data?.data?.links ?? data?.links ?? [];
    const cdn = (l: unknown) => typeof l === "string" && /cdninstagram|fbcdn/.test(l as string);
    const imgLinks = links.filter(
      (l) => typeof l === "string" && /cdninstagram|fbcdn/.test(l) && /\.(jpg|jpeg|png|webp)/i.test(l),
    );
    const vidLinks = links.filter((l) => cdn(l) && /\.mp4/i.test(l as string)) as string[];
    const out: ExtractedPost[] = [];
    for (const u of vidLinks.slice(0, limit)) out.push({ video_url: u });
    for (const u of imgLinks.slice(0, Math.max(0, limit - out.length))) out.push({ image_url: u });
    return out;
  }
  return posts.slice(0, limit).filter((p) => !!(p.image_url || p.video_url));
}

async function downloadAsset(url: string, kind: "image" | "video"): Promise<{ bytes: Uint8Array; mime: string }> {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": kind === "video"
        ? "video/mp4,video/*;q=0.9,*/*;q=0.8"
        : "image/avif,image/webp,image/jpeg,image/png,*/*",
    },
  });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const fallback = kind === "video" ? "video/mp4" : "image/jpeg";
  const mime = r.headers.get("content-type") || fallback;
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { bytes, mime };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const handle: string = (body.handle || DEFAULT_HANDLE).replace(/^@/, "").trim();
    const limit: number = Math.min(Math.max(parseInt(body.limit ?? DEFAULT_LIMIT, 10) || DEFAULT_LIMIT, 1), 25);
    const brand: string = body.brand_lockup || "shared";

    // Auth: either authenticated CMS editor/admin OR signed cron call.
    const authHeader = req.headers.get("Authorization");
    const signalHeader = req.headers.get("x-signal-secret");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let userId: string | null = null;

    if (signalHeader && KENNEL_SECRET && signalHeader === KENNEL_SECRET) {
      // cron / Lindy automated call — no user context
    } else {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      userId = userData?.user?.id ?? null;
      if (!userId) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isEditor } = await admin.rpc("is_cms_editor", { _user_id: userId });
      const { data: isAdmin } = await admin.rpc("is_admin_or_owner", { _user_id: userId });
      if (!isEditor && !isAdmin) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profileUrl = `https://www.instagram.com/${handle}/`;
    const posts = await firecrawlExtract(profileUrl, limit);

    if (posts.length === 0) {
      return new Response(JSON.stringify({ ok: true, imported: 0, skipped: 0, note: "No posts found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip already-imported permalinks
    const permalinks = posts.map((p) => p.permalink).filter(Boolean) as string[];
    const { data: existing } = await admin
      .from("creative_seed_assets")
      .select("refine_prompt")
      .in("refine_prompt", permalinks.length ? permalinks : ["__none__"]);
    const seen = new Set((existing ?? []).map((r: any) => r.refine_prompt));

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const post of posts) {
      const isVideo = !!post.video_url;
      const sourceUrl = post.video_url || post.image_url;
      if (!sourceUrl) { skipped++; continue; }
      if (post.permalink && seen.has(post.permalink)) { skipped++; continue; }
      try {
        const { bytes, mime } = await downloadAsset(sourceUrl, isVideo ? "video" : "image");
        const ext = (mime.split("/")[1] || (isVideo ? "mp4" : "jpg")).split("+")[0];
        const folder = userId ?? "instagram-auto";
        const prefix = isVideo ? "ig-video" : "ig";
        const path = `${folder}/${prefix}-${handle}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: upErr } = await admin.storage
          .from("creative-seeds")
          .upload(path, bytes, { contentType: mime, upsert: false });
        if (upErr) throw upErr;

        const { data: pub } = admin.storage.from("creative-seeds").getPublicUrl(path);

        const caption = (post.caption || "").slice(0, 280);
        const tags = ["instagram", `ig:${handle}`, isVideo ? "video" : "image"];

        const { error: insErr } = await admin.from("creative_seed_assets").insert({
          storage_path: path,
          public_url: pub.publicUrl,
          file_name: `instagram-${handle}-${isVideo ? "reel" : "post"}-${imported + 1}.${ext}`,
          mime_type: mime,
          size_bytes: bytes.length,
          label: caption || `Instagram ${isVideo ? "Reel" : "Post"} • @${handle}`,
          tags,
          brand_lockup: brand,
          uploaded_by: userId,
          // store permalink in refine_prompt to use for dedupe; also a usable seed for Lindy
          refine_prompt: post.permalink ?? null,
        });
        if (insErr) throw insErr;
        imported++;
      } catch (e: any) {
        skipped++;
        errors.push(`${post.permalink ?? sourceUrl}: ${e.message ?? e}`);
      }
    }

    // Best-effort signal so Lindy can pick up new seeds and iterate
    try {
      if (KENNEL_SECRET && imported > 0) {
        await fetch(`${SUPABASE_URL}/functions/v1/kennel-external-signal`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-signal-secret": KENNEL_SECRET },
          body: JSON.stringify({
            event_type: "instagram_seeds_imported",
            payload: { handle, imported, brand_lockup: brand },
          }),
        });
      }
    } catch (e) {
      console.error("signal failed", e);
    }

    return new Response(JSON.stringify({ ok: true, imported, skipped, errors: errors.slice(0, 5) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});