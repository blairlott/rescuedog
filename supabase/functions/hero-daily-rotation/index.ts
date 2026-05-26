import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const CRON_SECRET = Deno.env.get("HERO_CRON_SECRET") ?? "";

type Surface = "wine" | "merch";

const COPY_TEMPLATES: Record<Surface, Array<{ eyebrow: string; headline: string; sub: string; cta_label: string; cta_href: string }>> = {
  wine: [
    { eyebrow: "Lodi Cabernet · 50% of profits to rescue", headline: "Pour for<br/>the pack.", sub: "Award-winning, sustainably grown Lodi wines. Every bottle helps a rescue dog find a forever home.", cta_label: "Shop Wines", cta_href: "/wines" },
    { eyebrow: "Shipping included on 12+ bottles", headline: "Wine that gives<br/>back. Literally.", sub: "Half our profits go to animal rescue. Goes great with friends, food, and a dog at your feet.", cta_label: "Shop the Cabernet", cta_href: "/wines" },
    { eyebrow: "Wine Club · members-only releases", headline: "Save dogs.<br/>Sip the proof.", sub: "Join the Wine Club for member pricing, exclusive releases, and a direct line to the rescues we fund.", cta_label: "Join the Wine Club", cta_href: "/wine-club" },
  ],
  merch: [
    { eyebrow: "Gear that gives back · 50% of profits to rescue", headline: "Wear the cause.<br/>Spoil the pup.", sub: "Apparel, drinkware and pet gear designed in California, built to support animal rescue every day.", cta_label: "Shop Merch", cta_href: "/merch#products" },
    { eyebrow: "Made for rescue families", headline: "Soft tees.<br/>Big tails.", sub: "Every shirt, mug and bandana helps fund the rescues bringing dogs home.", cta_label: "Shop Merch", cta_href: "/merch#products" },
  ],
};

const IMAGE_PROMPTS: Record<Surface, string[]> = {
  wine: [
    "Cinematic wide photograph of friends toasting Rescue Dog Wines red wine on a sunlit Lodi California vineyard patio at golden hour, a friendly rescue dog at their feet, warm tones, shallow depth of field, lifestyle editorial style, 16:9",
    "Photorealistic editorial shot of a backyard dinner with charcuterie, a bottle of Rescue Dog Wines Cabernet Sauvignon center frame, friends laughing, rescue dog under the table, warm golden hour light, 16:9",
    "Lifestyle photo of a couple sharing red wine on a porch overlooking a vineyard at sunset with their rescue dog beside them, soft warm light, cinematic, 16:9",
  ],
  merch: [
    "Warm lifestyle photograph of a woman wearing a black tee with a small embroidered Rescue Dog Wines logo on the left chest, sitting outdoors with her rescue dog, golden hour, candid, editorial, 16:9",
    "Cinematic photo of a young woman in a worn-in tee with a small left-chest embroidered Rescue Dog Wines logo, holding a ceramic dog bowl in a sunlit kitchen, rescue dog looking up attentively, warm tones, 16:9",
    "Editorial lifestyle photo of a woman in a fitted tee with a small left-chest embroidered Rescue Dog Wines logo, walking her rescue dog down a vineyard row at sunset, dust in the air, warm golden hour, 16:9",
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
  const prompt = pick(IMAGE_PROMPTS[surface]);
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