// Harvests images from the legacy website and public Instagram via Firecrawl.
// Queues unique image URLs into media_assets with status='pending' for editor approval.
// Optionally scores each image with Lovable AI for brand fit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const LEGACY_URL = "https://rescuedogwines.com";
const INSTAGRAM_HANDLE = "rescuedogwines";

const IMG_EXT = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;
const SKIP_PATTERNS = [
  /favicon/i, /logo/i, /icon/i, /sprite/i, /pixel/i, /tracking/i, /analytics/i,
  /\/wp-includes\//i, /emoji/i,
];

type FoundImage = { url: string; alt?: string; source_url: string };

async function firecrawlScrape(url: string): Promise<{ html?: string; markdown?: string; links?: string[]; screenshot?: string }> {
  if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY missing");
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["html", "links"],
      onlyMainContent: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Firecrawl scrape failed [${res.status}]: ${JSON.stringify(data).slice(0, 300)}`);
  return data.data ?? data;
}

async function firecrawlMap(url: string, limit = 50): Promise<string[]> {
  if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY missing");
  const res = await fetch("https://api.firecrawl.dev/v2/map", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, limit, includeSubdomains: false }),
  });
  const data = await res.json();
  if (!res.ok) return [];
  return (data.links ?? data.data?.links ?? []) as string[];
}

function extractImagesFromHtml(html: string, sourceUrl: string): FoundImage[] {
  const out: FoundImage[] = [];
  // <img src="..." alt="...">  and srcset
  const imgRegex = /<img\b[^>]*?>/gi;
  const srcRegex = /\bsrc\s*=\s*["']([^"']+)["']/i;
  const altRegex = /\balt\s*=\s*["']([^"']*)["']/i;
  const srcsetRegex = /\bsrcset\s*=\s*["']([^"']+)["']/i;

  for (const tag of html.match(imgRegex) ?? []) {
    const src = tag.match(srcRegex)?.[1];
    const alt = tag.match(altRegex)?.[1];
    const srcset = tag.match(srcsetRegex)?.[1];
    const candidates = [src, srcset?.split(",").pop()?.trim().split(" ")[0]].filter(Boolean) as string[];
    for (const c of candidates) {
      try {
        const abs = new URL(c, sourceUrl).toString();
        out.push({ url: abs, alt, source_url: sourceUrl });
      } catch { /* ignore */ }
    }
  }

  // og:image / twitter:image
  const metaRegex = /<meta\s+[^>]*?(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["'][^>]*?content\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRegex.exec(html))) {
    try { out.push({ url: new URL(m[1], sourceUrl).toString(), source_url: sourceUrl }); } catch { /* ignore */ }
  }
  return out;
}

function shouldKeep(url: string): boolean {
  if (!IMG_EXT.test(url)) return false;
  if (SKIP_PATTERNS.some((rx) => rx.test(url))) return false;
  return true;
}

async function scoreWithAI(imageUrl: string, captionHint?: string): Promise<{ score: number; tags: string[]; subject: string } | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You score images for a wine brand whose mission is rescue-dog adoption. Score 0-100 for hero-image fit. Return strict JSON: {\"score\":number,\"tags\":string[],\"subject\":\"dog\"|\"wine\"|\"lifestyle\"|\"people\"|\"other\"}." },
          { role: "user", content: [
            { type: "text", text: `Score this image for use as a hero or marketing image on Rescue Dog Wines. Caption hint: ${captionHint ?? "none"}` },
            { type: "image_url", image_url: { url: imageUrl } },
          ] },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return {
      score: Number(parsed.score) || 0,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [],
      subject: String(parsed.subject ?? "other"),
    };
  } catch (e) {
    console.warn("AI score failed", e);
    return null;
  }
}

async function harvestLegacy(supabase: ReturnType<typeof createClient>, jobId: string): Promise<{ found: number; added: number }> {
  let pages = await firecrawlMap(LEGACY_URL, 40);
  if (pages.length === 0) pages = [LEGACY_URL];
  pages = [LEGACY_URL, ...pages.filter((p) => p !== LEGACY_URL)].slice(0, 12); // cap to control credits

  const seen = new Set<string>();
  const all: FoundImage[] = [];
  for (const page of pages) {
    try {
      const scraped = await firecrawlScrape(page);
      if (!scraped.html) continue;
      const imgs = extractImagesFromHtml(scraped.html, page).filter((i) => shouldKeep(i.url));
      for (const img of imgs) {
        if (seen.has(img.url)) continue;
        seen.add(img.url);
        all.push(img);
      }
    } catch (e) {
      console.warn("scrape failed", page, e);
    }
  }

  await supabase.from("harvest_jobs").update({ items_found: all.length }).eq("id", jobId);

  let added = 0;
  for (const img of all.slice(0, 80)) {
    const ai = await scoreWithAI(img.url, img.alt);
    const row = {
      source: "legacy_site",
      source_url: img.source_url,
      image_url: img.url,
      alt_text: img.alt ?? null,
      ai_score: ai?.score ?? null,
      ai_tags: ai?.tags ?? [],
      ai_subject: ai?.subject ?? null,
      status: "pending",
    };
    const { error } = await supabase.from("media_assets").insert(row);
    if (!error) added++;
  }
  return { found: all.length, added };
}

async function harvestInstagram(supabase: ReturnType<typeof createClient>, jobId: string, handle: string): Promise<{ found: number; added: number }> {
  const profileUrl = `https://www.instagram.com/${handle}/`;
  const scraped = await firecrawlScrape(profileUrl);
  const html = scraped.html ?? "";
  // IG embeds images in JSON inside <script type="application/ld+json"> and og:image meta; pull every image URL we can find.
  const urlRx = /https:\/\/[^"'\s<>)]*\.(?:jpg|jpeg|webp|png)(?:\?[^"'\s<>)]*)?/gi;
  const seen = new Set<string>();
  const out: FoundImage[] = [];
  for (const m of html.match(urlRx) ?? []) {
    if (seen.has(m)) continue;
    seen.add(m);
    // Skip avatar/profile pics if obvious.
    if (/profile_pic|avatar/i.test(m)) continue;
    out.push({ url: m, source_url: profileUrl });
  }

  await supabase.from("harvest_jobs").update({ items_found: out.length }).eq("id", jobId);

  let added = 0;
  for (const img of out.slice(0, 40)) {
    const ai = await scoreWithAI(img.url, `Instagram @${handle}`);
    const { error } = await supabase.from("media_assets").insert({
      source: "instagram",
      source_url: img.url,
      source_post_url: profileUrl,
      image_url: img.url,
      ai_score: ai?.score ?? null,
      ai_tags: ai?.tags ?? [],
      ai_subject: ai?.subject ?? null,
      status: "pending",
    });
    if (!error) added++;
  }
  return { found: out.length, added };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: { source?: "legacy" | "instagram" | "all"; handle?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const source = body.source ?? "all";

  const results: Record<string, { found: number; added: number; error?: string }> = {};

  const runOne = async (label: "legacy" | "instagram") => {
    const { data: job } = await supabase
      .from("harvest_jobs")
      .insert({ source: label === "legacy" ? "legacy_site" : "instagram", status: "running" })
      .select("id").single();
    const jobId = job?.id as string;
    try {
      const res = label === "legacy"
        ? await harvestLegacy(supabase, jobId)
        : await harvestInstagram(supabase, jobId, body.handle ?? INSTAGRAM_HANDLE);
      await supabase.from("harvest_jobs").update({
        status: "completed",
        items_found: res.found,
        items_new: res.added,
        finished_at: new Date().toISOString(),
      }).eq("id", jobId);
      results[label] = res;
      const stateField = label === "legacy" ? "last_harvest_legacy_at" : "last_harvest_instagram_at";
      await supabase.from("autopilot_state").update({ [stateField]: new Date().toISOString() }).eq("id", 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("harvest_jobs").update({
        status: "failed", error: msg, finished_at: new Date().toISOString(),
      }).eq("id", jobId);
      results[label] = { found: 0, added: 0, error: msg };
    }
  };

  if (source === "legacy" || source === "all") await runOne("legacy");
  if (source === "instagram" || source === "all") await runOne("instagram");

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});