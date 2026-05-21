// Enhance or iterate on an approved harvested image using Lovable AI image models.
// Takes a source media_assets row, runs Gemini image edit/generate, uploads to harvested-media,
// and inserts new media_assets rows (status='pending') linked to the parent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const PRESETS: Record<string, string> = {
  enhance: "Enhance this image: increase sharpness and detail, improve lighting and color balance, remove compression artifacts and noise. Keep the exact same subject, composition, and framing — do not add or remove elements.",
  hero: "Restyle this image as a premium hero banner for Rescue Dog Wines: cinematic lighting, warm rich tones, slight depth-of-field, editorial composition. Keep the same subject (dog/wine/lifestyle). Wide 16:9 framing.",
  square: "Reframe as a clean 1:1 social square. Center the subject, keep warm editorial tone consistent with a premium wine brand. Do not add text or logos.",
  background: "Replace the background with a clean, brand-appropriate setting (warm natural light, soft bokeh wood/vineyard tones). Keep the subject pixel-identical.",
  hd_authentic: "Upscale this image to crisp high-definition with photographic realism. Recover fine texture in fur, fabric, glass and skin. Natural color grading, true-to-life skin tones, no plastic smoothing, no over-sharpening. Preserve the exact subject, pose, and composition — do not add, remove, or restyle any element.",
  scene_vineyard: "Compose a new scene that places the existing subject (dog and/or people) together with a bottle of Rescue Dog Wines in a sunlit vineyard at golden hour. Photorealistic, editorial wine-brand styling, shallow depth of field. Keep the subject's identity, breed, and clothing recognizable. The wine bottle must be intact, label legible-but-not-faked.",
  scene_picnic: "Place the existing subject (dog and/or people) at a relaxed countryside picnic with a bottle of Rescue Dog Wines and two glasses on a wooden board. Warm natural daylight, soft bokeh, photorealistic. Keep the subject's identity recognizable.",
  scene_kitchen: "Place the existing subject (dog and/or people) in a warm modern farmhouse kitchen with a bottle of Rescue Dog Wines on the counter. Soft window light, editorial lifestyle photography, photorealistic. Keep the subject's identity recognizable.",
  scene_fireside: "Place the existing subject (dog and/or people) by a cozy fireplace in the evening with a bottle of Rescue Dog Wines and a poured glass. Warm amber light, photorealistic, cinematic. Keep the subject's identity recognizable.",
  scene_beach: "Place the existing subject (dog and/or people) at a quiet coastal beach at sunset with a bottle of Rescue Dog Wines in the sand. Golden hour, photorealistic, editorial. Keep the subject's identity recognizable.",
};

async function fetchAsDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch source failed [${r.status}]`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const mime = r.headers.get("content-type") ?? "image/jpeg";
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

async function callImageModel(model: string, prompt: string, sourceUrl: string | null): Promise<string> {
  const messages: Array<Record<string, unknown>> = [];
  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  if (sourceUrl) userContent.push({ type: "image_url", image_url: { url: sourceUrl } });
  messages.push({ role: "user", content: userContent });

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      modalities: ["image", "text"],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`AI image call failed [${res.status}]: ${JSON.stringify(data).slice(0, 400)}`);
  const msg = data.choices?.[0]?.message;
  const imgUrl: string | undefined = msg?.images?.[0]?.image_url?.url
    ?? msg?.images?.[0]?.url
    ?? (typeof msg?.content === "string" && msg.content.startsWith("data:image") ? msg.content : undefined);
  if (!imgUrl) throw new Error(`No image returned: ${JSON.stringify(data).slice(0, 400)}`);
  return imgUrl;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string; ext: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("invalid data url");
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { bytes, mime, ext };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      asset_id,
      preset,
      custom_prompt,
      extra_vibes,
      variants = 1,
      model = "google/gemini-2.5-flash-image",
    }: {
      asset_id?: string;
      preset?: keyof typeof PRESETS;
      custom_prompt?: string;
      extra_vibes?: string[];
      variants?: number;
      model?: string;
    } = body;

    if (!asset_id) throw new Error("asset_id required");
    const basePrompt = custom_prompt?.trim() || (preset && PRESETS[preset]) || PRESETS.enhance;
    const vibes = Array.isArray(extra_vibes) ? extra_vibes.filter(Boolean) : [];
    const prompt = vibes.length > 0 ? `${basePrompt} Overall mood/vibe: ${vibes.join(", ")}.` : basePrompt;
    const count = Math.max(1, Math.min(4, Number(variants) || 1));

    const { data: parent, error: pErr } = await supabase
      .from("media_assets").select("*").eq("id", asset_id).single();
    if (pErr || !parent) throw new Error(`parent asset not found: ${pErr?.message ?? "missing"}`);

    // Pass source as data URL so the model can reliably read it.
    const sourceDataUrl = await fetchAsDataUrl(parent.image_url as string);

    const results: Array<{ id: string; url: string }> = [];
    for (let i = 0; i < count; i++) {
      const generated = await callImageModel(model, prompt, sourceDataUrl);
      const { bytes, mime, ext } = dataUrlToBytes(generated);
      const path = `enhanced/${asset_id}/${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("harvested-media").upload(path, bytes, { contentType: mime, upsert: false });
      if (upErr) throw new Error(`upload failed: ${upErr.message}`);
      const { data: pub } = supabase.storage.from("harvested-media").getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { data: inserted, error: insErr } = await supabase.from("media_assets").insert({
        source: "ai_enhanced",
        source_url: parent.image_url,
        image_url: publicUrl,
        storage_path: path,
        alt_text: parent.alt_text,
        ai_tags: [...(parent.ai_tags ?? []), "ai_enhanced", preset ?? "custom"],
        ai_subject: parent.ai_subject,
        status: "pending",
        metadata: {
          parent_asset_id: asset_id,
          prompt,
          preset: preset ?? null,
          model,
          variant_index: i,
          derivative_kind: preset && preset.startsWith("scene_") ? "scene_variant" : "enhancement",
          auto: body.auto === true,
        },
      }).select("id").single();
      if (insErr) throw new Error(`insert failed: ${insErr.message}`);
      results.push({ id: inserted!.id as string, url: publicUrl });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("enhance-image error", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});