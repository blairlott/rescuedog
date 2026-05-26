import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

type Surface = "wine" | "merch";

// BRAND GUARDRAILS (do not violate):
// - Mission framing: "helping dogs find their forever home." Qualitative only.
// - NEVER use "free shipping" — always "shipping included".
// - NEVER show counters, totals, or quantified impact (no "X homes funded", no meals, no tickers).
// - Loyalty = access-based ("The Pack"), never % off.
// - Voice: warm, confident, understated. No exclamation marks. No emojis.
const COPY_TEMPLATES: Record<Surface, Array<{ eyebrow: string; headline: string; sub: string; cta_label: string; cta_href: string }>> = {
  wine: [
    { eyebrow: "Lodi Cabernet · helping dogs find their forever home", headline: "Pour for<br/>the pack.", sub: "Award-winning, sustainably grown Lodi wines. Every bottle helps a rescue dog find a forever home.", cta_label: "Shop Wines", cta_href: "/wines" },
    { eyebrow: "Shipping included on 12+ bottles", headline: "Wine that gives<br/>back. Quietly.", sub: "A portion of every bottle supports animal rescue. Goes great with friends, food, and a dog at your feet.", cta_label: "Shop the Cabernet", cta_href: "/wines" },
    { eyebrow: "The Pack · members-only releases", headline: "Join the<br/>Pack.", sub: "Members get first access to small-lot releases, library wines, and a direct line to the rescues we support.", cta_label: "Join the Wine Club", cta_href: "/wine-club" },
    { eyebrow: "Sustainably grown · Lodi, California", headline: "Estate wines.<br/>Rescued hearts.", sub: "Hand-tended vineyards. Honest winemaking. A mission to help dogs find their forever home.", cta_label: "Shop Wines", cta_href: "/wines" },
  ],
  merch: [
    { eyebrow: "Gear that gives back", headline: "Wear the cause.<br/>Spoil the pup.", sub: "Apparel, drinkware and pet gear designed in California — built to support animal rescue every day.", cta_label: "Shop Merch", cta_href: "/merch#products" },
    { eyebrow: "Made for rescue families", headline: "Soft tees.<br/>Big tails.", sub: "Every shirt, mug and bandana helps dogs find their forever home.", cta_label: "Shop Merch", cta_href: "/merch#products" },
    { eyebrow: "Shipping included on orders 50+", headline: "Dressed for<br/>the rescue.", sub: "Heavyweight cotton, embroidered Rescue Dog mark. Built to last, built to give back.", cta_label: "Shop Merch", cta_href: "/merch#products" },
  ],
};

// Universal brand guardrails appended to every image prompt.
const BRAND_RULES = [
  "BRAND GUARDRAILS — must follow strictly:",
  "- Photoreal editorial lifestyle photography only. No illustrations, no 3D renders, no AI-looking glow.",
  "- Color palette: warm naturals + Rescue Dog red (#c30017) as a single restrained accent (a wine label, a tee, a leash). Black and grey supporting. No purple, no teal, no neon.",
  "- Composition leaves clean negative space on the LEFT third for headline text overlay. Subject lives in the right two thirds.",
  "- ABSOLUTELY NO text, words, letters, logos, watermarks, signage, or typography rendered in the image.",
  "- Dogs must look like real adoptable rescue mixes (mutts, pit mixes, hounds, scruffy terriers) — not pedigree show dogs.",
  "- People: diverse, candid, real-bodied. No staged stock-photo grins. No models younger than mid-20s.",
  "- Aesthetic: warm golden-hour or soft window light, fine grain, shallow depth of field, 35mm editorial feel. Sharp, flat, honest — never glossy or over-stylized.",
  "- 16:9 horizontal, cinematic.",
].join(" ");

const IMAGE_PROMPTS: Record<Surface, string[]> = {
  wine: [
    "Cinematic wide photograph of friends toasting red wine on a sunlit Lodi California vineyard patio at golden hour, a scruffy rescue mutt at their feet, warm earthy tones, shallow depth of field, editorial lifestyle.",
    "Photoreal editorial shot of a backyard harvest dinner, a single dark red wine bottle on a weathered wood table, friends in conversation, a rescue pit mix resting underneath, warm golden hour light, restrained palette.",
    "Lifestyle photograph of a couple sharing red wine on a farmhouse porch overlooking Lodi vineyard rows at sunset, their rescue hound beside them, warm naturals, cinematic 35mm feel.",
    "Editorial photograph of weathered hands pouring red wine into a single glass on a vineyard barrel, golden backlight, a rescue dog out of focus in the background, warm restrained tones.",
  ],
  merch: [
    "Warm lifestyle photograph of a woman in her 30s wearing a plain black heavyweight cotton tee with a small embroidered mark on the left chest, sitting on a porch with her scruffy rescue mutt, golden hour, candid, editorial.",
    "Photoreal editorial shot of a man in a worn-in charcoal tee with a small left-chest embroidered mark, kneeling to refill a ceramic dog bowl in a sunlit California kitchen, a rescue pit mix waiting attentively, warm naturals.",
    "Editorial lifestyle photograph of a woman in a fitted black tee with a small left-chest embroidered mark, walking her rescue hound down a vineyard row at sunset, dust in the warm light, candid, restrained palette.",
    "Photoreal close-up of a rescue mutt wearing a simple red bandana (Rescue Dog red #c30017) on a sunlit California front step, owner's denim legs and worn boots in soft focus behind, warm editorial tones.",
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateImage(prompt: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const json = await res.json();
  // Find first image data URL in assistant message
  const msg = json.choices?.[0]?.message;
  const dataUrl: string | undefined =
    msg?.images?.[0]?.image_url?.url ||
    (Array.isArray(msg?.content)
      ? msg.content.find((p: any) => p?.type === "image_url" || p?.type === "image")?.image_url?.url
      : undefined);
  if (!dataUrl?.startsWith("data:image/")) {
    throw new Error("AI did not return image data URL");
  }
  return dataUrl;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string; ext: string } {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) throw new Error("invalid data url");
  const contentType = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = contentType.split("/")[1].replace("jpeg", "jpg").split("+")[0];
  return { bytes, contentType, ext };
}

async function generateOneForSurface(surface: Surface, supabase: any, createdBy: string | null) {
  const scene = pick(IMAGE_PROMPTS[surface]);
  const prompt = `${scene} ${BRAND_RULES}`;
  const dataUrl = await generateImage(prompt);
  const { bytes, contentType, ext } = dataUrlToBytes(dataUrl);
  const path = `${surface}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const up = await supabase.storage.from("hero-images").upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (up.error) throw up.error;
  const { data: pub } = supabase.storage.from("hero-images").getPublicUrl(path);
  const copy = pick(COPY_TEMPLATES[surface]);
  const ins = await supabase.from("hero_variants").insert({
    surface,
    image_url: pub.publicUrl,
    image_alt: surface === "wine"
      ? "Friends enjoying Rescue Dog Wines with a rescue dog"
      : "Lifestyle photo of Rescue Dog Wines merch worn with a rescue dog",
    eyebrow: copy.eyebrow,
    headline_html: copy.headline,
    sub: copy.sub,
    cta_label: copy.cta_label,
    cta_href: copy.cta_href,
    auto_generated: true,
    created_by: createdBy,
  }).select().single();
  if (ins.error) throw ins.error;
  return ins.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: cron secret, service-role bearer (used by pg_cron), OR owner/admin JWT
  const cronHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
  const isCron =
    (!!CRON_SECRET && cronHeader === CRON_SECRET) ||
    (!!authHeader && !!SERVICE_KEY && authHeader === SERVICE_KEY);
  let userId: string | null = null;
  if (!isCron) {
    const auth = authHeader;
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${auth}` } },
    });
    const { data: ures } = await userClient.auth.getUser();
    if (!ures?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: roleOk } = await supabase.rpc("is_admin_or_owner", { _user_id: ures.user.id });
    if (!roleOk) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    userId = ures.user.id;
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const requestedSurface: Surface | undefined = body?.surface;
  const surfaces: Surface[] = requestedSurface ? [requestedSurface] : ["wine", "merch"];

  const results: any[] = [];
  for (const s of surfaces) {
    try {
      const v = await generateOneForSurface(s, supabase, userId);
      results.push({ surface: s, ok: true, variant_id: v.id });
    } catch (e: any) {
      results.push({ surface: s, ok: false, error: String(e?.message || e) });
    }
  }

  // Auto-tune (sticky winners / retire losers)
  try {
    const { data: tune } = await supabase.rpc("auto_tune_hero_variants", { _min_impressions: 1000, _days: 30 });
    return new Response(JSON.stringify({ generated: results, tuned: tune ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ generated: results, tune_error: String(e?.message || e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});