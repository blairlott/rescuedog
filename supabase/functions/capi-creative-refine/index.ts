import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const REFINE_MODES: Record<string, string> = {
  enhance:
    "Enhance this image for maximum consumer impact: boost clarity, contrast, color richness, and lighting. Keep composition. Make it look like premium editorial photography.",
  reframe_hero:
    "Reframe and recompose this image to a 16:9 hero banner crop. Hero subject centered slightly left with negative space for headline. Maintain natural look — no text overlays.",
  reframe_pdp:
    "Reframe to a 4:5 portrait product-detail composition. Tighten on the subject. Premium PDP feel.",
  reframe_square:
    "Reframe to a perfectly square 1:1 composition optimized for social ad creative. Subject centered, strong focal point.",
  cinematic:
    "Recolor and relight cinematically — warm golden-hour tone, soft shadows, shallow depth-of-field feel. Mission-led documentary style.",
};

const BRAND_GUARDRAILS = `Brand guardrails:
- Color palette leans red #c30017, black, grey. Don't introduce competing dominant colors.
- NO text, words, letters, logos, watermarks added to the image.
- Keep it warm, mission-led, documentary — never glossy stock.
- No quantified impact claims or numbers overlaid.`;

async function callGatewayEdit(prompt: string, imageDataUrl: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`gateway ${r.status}: ${text.slice(0, 400)}`);
  }
  const json = await r.json();
  const imageUrl: string | undefined =
    json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) throw new Error("no image returned from gateway");
  return imageUrl;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) throw new Error("invalid data url");
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`failed to fetch source image: ${r.status}`);
  const mime = r.headers.get("content-type") || "image/jpeg";
  const buf = new Uint8Array(await r.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  const b64 = btoa(binary);
  return `data:${mime};base64,${b64}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const seedId: string | undefined = body.seed_id;
    const mode: string = body.mode || "enhance";
    const customPrompt: string | undefined = body.prompt;
    if (!seedId) {
      return new Response(JSON.stringify({ error: "seed_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: isEditor } = await admin.rpc("is_cms_editor", { _user_id: userId });
    const { data: isAdmin } = await admin.rpc("is_admin_or_owner", { _user_id: userId });
    if (!isEditor && !isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: seed, error: seedErr } = await admin
      .from("creative_seed_assets")
      .select("*")
      .eq("id", seedId)
      .single();
    if (seedErr || !seed) {
      return new Response(JSON.stringify({ error: "seed not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const refineInstruction =
      customPrompt?.trim() || REFINE_MODES[mode] || REFINE_MODES.enhance;
    const fullPrompt = [
      "You are refining a reference photo for Rescue Dog Wine.",
      refineInstruction,
      BRAND_GUARDRAILS,
    ].join("\n\n");

    const sourceDataUrl = await fetchAsDataUrl(seed.public_url);
    const outDataUrl = await callGatewayEdit(fullPrompt, sourceDataUrl);
    const { bytes, mime } = dataUrlToBytes(outDataUrl);
    const ext = mime.split("/")[1]?.split("+")[0] || "png";
    const path = `${userId}/refined-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await admin.storage
      .from("creative-seeds")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = admin.storage.from("creative-seeds").getPublicUrl(path);

    const { data: inserted, error: insErr } = await admin
      .from("creative_seed_assets")
      .insert({
        storage_path: path,
        public_url: pub.publicUrl,
        file_name: `refined-${mode}-${seed.file_name}`,
        mime_type: mime,
        size_bytes: bytes.length,
        label: seed.label ? `${seed.label} (refined • ${mode})` : `Refined • ${mode}`,
        tags: [...(seed.tags ?? []), "refined", mode],
        brand_lockup: seed.brand_lockup,
        uploaded_by: userId,
        parent_seed_id: seed.id,
        refined: true,
        refine_prompt: refineInstruction,
      })
      .select("id, public_url")
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, seed: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});