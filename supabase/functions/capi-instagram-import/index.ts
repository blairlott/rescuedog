import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_PAGE_ACCESS_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN");
const META_SYSTEM_USER_TOKEN = Deno.env.get("META_SYSTEM_USER_TOKEN");
const IG_BUSINESS_ACCOUNT_ID = Deno.env.get("IG_BUSINESS_ACCOUNT_ID"); // optional cache
const KENNEL_SECRET = Deno.env.get("KENNEL_EXTERNAL_SIGNAL_SECRET");

const DEFAULT_HANDLE = "rescuedogwines";
const DEFAULT_LIMIT = 12;
const GRAPH = "https://graph.facebook.com/v21.0";

type ExtractedPost = {
  image_url?: string;
  video_url?: string;
  caption?: string;
  permalink?: string;
};

class MetaConfigError extends Error {
  constructor(message: string) { super(message); this.name = "MetaConfigError"; }
}

async function graphGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`Graph ${path} ${r.status}: ${JSON.stringify(data?.error ?? data).slice(0, 400)}`);
  }
  return data;
}

async function resolveIgUserId(token: string): Promise<string> {
  if (IG_BUSINESS_ACCOUNT_ID) return IG_BUSINESS_ACCOUNT_ID;
  // Discover via the page tied to this token.
  // Try /me?fields=instagram_business_account first (works if token IS a page token).
  try {
    const me = await graphGet("/me", token, { fields: "instagram_business_account" });
    const id = me?.instagram_business_account?.id;
    if (id) return id;
  } catch (_) { /* fall through */ }
  // Fall back: list pages this user manages and pick the first with an IG business account.
  const accounts = await graphGet("/me/accounts", token, { fields: "id,name,instagram_business_account" });
  const page = (accounts?.data ?? []).find((p: any) => p?.instagram_business_account?.id);
  if (!page) {
    throw new MetaConfigError(
      "No Instagram Business Account is linked to the Meta Page this token belongs to. " +
      "In Meta Business Suite, link the IG account to the Page, or set IG_BUSINESS_ACCOUNT_ID secret directly.",
    );
  }
  return page.instagram_business_account.id;
}

async function fetchInstagramPosts(handle: string, limit: number): Promise<ExtractedPost[]> {
  const token = META_PAGE_ACCESS_TOKEN || META_SYSTEM_USER_TOKEN;
  if (!token) {
    throw new MetaConfigError("META_PAGE_ACCESS_TOKEN (or META_SYSTEM_USER_TOKEN) not configured.");
  }
  const igUserId = await resolveIgUserId(token);

  // If a specific handle was passed and it's NOT the owned account, use Business Discovery.
  // Otherwise pull own media directly (richer fields).
  let ownUsername = "";
  try {
    const me = await graphGet(`/${igUserId}`, token, { fields: "username" });
    ownUsername = (me?.username || "").toLowerCase();
  } catch (_) { /* ignore */ }

  if (handle && ownUsername && handle.toLowerCase() !== ownUsername) {
    // Business Discovery (read-only, public IG business/creator accounts)
    const fields = `business_discovery.username(${handle}){media.limit(${limit}){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}`;
    const data = await graphGet(`/${igUserId}`, token, { fields });
    const edges = data?.business_discovery?.media?.data ?? [];
    return edges.map(mapMedia).filter(Boolean) as ExtractedPost[];
  }

  // Own account media
  const data = await graphGet(`/${igUserId}/media`, token, {
    fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
    limit: String(limit),
  });
  const edges = data?.data ?? [];
  return edges.map(mapMedia).filter(Boolean) as ExtractedPost[];
}

function mapMedia(m: any): ExtractedPost | null {
  if (!m) return null;
  const type = (m.media_type || "").toUpperCase();
  if (type === "VIDEO") {
    return {
      video_url: m.media_url,
      image_url: m.thumbnail_url,
      caption: m.caption,
      permalink: m.permalink,
    };
  }
  if (type === "IMAGE" || type === "CAROUSEL_ALBUM") {
    return {
      image_url: m.media_url || m.thumbnail_url,
      caption: m.caption,
      permalink: m.permalink,
    };
  }
  return null;
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

    if (!META_PAGE_ACCESS_TOKEN && !META_SYSTEM_USER_TOKEN) {
      return new Response(JSON.stringify({ error: "META_PAGE_ACCESS_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const posts = await fetchInstagramPosts(handle, limit);

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
    if (e instanceof MetaConfigError) {
      return new Response(JSON.stringify({
        ok: false,
        imported: 0,
        skipped: 0,
        error: "META_CONFIG",
        message: e.message,
        fallback: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});