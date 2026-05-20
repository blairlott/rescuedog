// Creative Studio API
// Single function, action-routed. Handles:
//  - setup-check        : is Creatomate API key configured?
//  - save-key           : save Creatomate API key to integration_credentials
//  - reformat           : AI recompose image to target ratios (Lovable AI / Nano Banana 2)
//  - copy-iterate       : generate N copy variants (Lovable AI / Gemini Flash, structured output)
//  - kenburns-render    : kick off Creatomate render, returns render id (job_id stored on output row)
//  - kenburns-poll      : poll Creatomate render status, update output row when done

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const PROVIDER = "creatomate";

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  return data.user ?? null;
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

async function getCreatomateKey(): Promise<string | null> {
  const sb = admin();
  const { data } = await sb
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", PROVIDER)
    .eq("credential_key", "api_key")
    .eq("scope", "live")
    .maybeSingle();
  return data?.credential_value ?? null;
}

// ---------- AI calls ----------

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function recomposeImage(sourceUrl: string, ratio: string): Promise<string | null> {
  // Use Nano Banana 2 to recompose for the target aspect ratio.
  const prompt = `Recompose this image for a ${ratio} aspect ratio. Keep the main subject clearly visible and well-composed. Extend the background tastefully where needed. Do NOT add any text, logos, or overlays. Output a single clean image suitable for advertising.`;
  const r = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: sourceUrl } },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });
  if (!r.ok) {
    console.error("recompose error", r.status, await r.text());
    return null;
  }
  const j = await r.json();
  // Lovable AI image responses include an images array on the choice message.
  const imgB64 = j.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
  return imgB64; // data URL
}

async function generateCopyVariants(brief: string, tones: string[]): Promise<any[]> {
  const r = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You write performance ad copy for Rescue Dog Wines, a wine brand whose mission is helping dogs find their forever home. Voice: warm, mission-led, never gimmicky. Never say 'free shipping' — always 'shipping included'. Never quantify impact with specific numbers. Keep it short and punchy.",
        },
        {
          role: "user",
          content: `Brief: ${brief}\n\nProduce one ad variant for EACH tone: ${tones.join(", ")}.\nReturn JSON only, with shape: { "variants": [ { "tone": string, "headline": string, "subhead": string, "cta": string, "caption": string, "hashtags": string[] } ] }`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    console.error("copy error", r.status, await r.text());
    return [];
  }
  const j = await r.json();
  try {
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    return parsed.variants ?? [];
  } catch {
    return [];
  }
}

// ---------- Helpers ----------

function ratioToDims(ratio: string): { width: number; height: number } {
  const map: Record<string, { width: number; height: number }> = {
    "1:1": { width: 1080, height: 1080 },
    "4:5": { width: 1080, height: 1350 },
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
    "2:3": { width: 1000, height: 1500 },
    "1.91:1": { width: 1200, height: 628 },
    "4:3": { width: 1600, height: 1200 },
    "21:9": { width: 1920, height: 822 },
  };
  return map[ratio] ?? { width: 1080, height: 1080 };
}

async function uploadDataUrl(jobId: string, name: string, dataUrl: string): Promise<string | null> {
  const sb = admin();
  const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const path = `outputs/${jobId}/${name}.${ext}`;
  const { error } = await sb.storage.from("creative-studio").upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) {
    console.error("upload error", error);
    return null;
  }
  const { data } = sb.storage.from("creative-studio").getPublicUrl(path);
  return data.publicUrl;
}

// ---------- Action handlers ----------

async function handleSetupCheck() {
  const key = await getCreatomateKey();
  return json({ configured: !!key });
}

async function handleSaveKey(req: Request, user: any) {
  const body = await req.json();
  const key = (body.api_key ?? "").trim();
  if (!key) return json({ error: "api_key required" }, 400);

  const sb = admin();
  const { error } = await sb.from("integration_credentials").upsert(
    {
      provider: PROVIDER,
      credential_key: "api_key",
      scope: "live",
      credential_value: key,
      created_by: user.id,
      updated_by: user.id,
      notes: "Creatomate API key for Creative Studio Ken Burns video rendering",
    },
    { onConflict: "provider,credential_key,scope" },
  );
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

async function handleReformat(req: Request) {
  const { job_id, ratios } = await req.json();
  const sb = admin();
  const { data: job } = await sb.from("creative_jobs").select("*").eq("id", job_id).single();
  if (!job) return json({ error: "job not found" }, 404);

  const results: any[] = [];
  for (const ratio of ratios) {
    const { data: row } = await sb
      .from("creative_outputs")
      .insert({ job_id, kind: "image", ratio, status: "running" })
      .select()
      .single();
    const dataUrl = await recomposeImage(job.source_url, ratio);
    if (!dataUrl) {
      await sb.from("creative_outputs").update({ status: "error", error: "AI recompose failed" }).eq("id", row!.id);
      results.push({ id: row!.id, ratio, status: "error" });
      continue;
    }
    const url = await uploadDataUrl(job_id, `image-${ratio.replace(/[:.]/g, "_")}`, dataUrl);
    await sb
      .from("creative_outputs")
      .update({ status: "done", url, meta: ratioToDims(ratio) })
      .eq("id", row!.id);
    results.push({ id: row!.id, ratio, status: "done", url });
  }
  return json({ results });
}

async function handleCopyIterate(req: Request) {
  const { job_id, brief, tones } = await req.json();
  const sb = admin();
  const useTones = (tones && tones.length ? tones : ["Mission", "Product", "Urgency", "Story"]) as string[];
  const variants = await generateCopyVariants(brief ?? "", useTones);
  const rows = variants.map((v) => ({
    job_id,
    kind: "copy" as const,
    status: "done" as const,
    meta: v,
  }));
  if (rows.length) await sb.from("creative_outputs").insert(rows);
  return json({ variants });
}

async function handleKenBurnsRender(req: Request) {
  const key = await getCreatomateKey();
  if (!key) return json({ error: "creatomate_not_configured" }, 412);

  const { job_id, ratio, duration, caption, source_url } = await req.json();
  const dims = ratioToDims(ratio ?? "9:16");
  const dur = Math.max(5, Math.min(30, duration ?? 8));

  const sb = admin();
  const { data: row } = await sb
    .from("creative_outputs")
    .insert({ job_id, kind: "video", ratio, status: "running", meta: { duration: dur, caption } })
    .select()
    .single();

  // Creatomate inline source: pan/zoom image + optional caption + bottom safe area.
  const source: any = {
    output_format: "mp4",
    width: dims.width,
    height: dims.height,
    frame_rate: 30,
    duration: dur,
    elements: [
      {
        type: "image",
        source: source_url,
        fit: "cover",
        animations: [
          {
            type: "scale",
            start_scale: { x: 1.0, y: 1.0 },
            end_scale: { x: 1.18, y: 1.18 },
            easing: "linear",
            duration: dur,
          },
          {
            type: "pan",
            start_x: "0%",
            start_y: "0%",
            end_x: "5%",
            end_y: "-5%",
            easing: "linear",
            duration: dur,
          },
        ],
      },
    ],
  };

  if (caption) {
    source.elements.push({
      type: "text",
      text: caption,
      y: "82%",
      x: "50%",
      width: "88%",
      height: "auto",
      font_family: "Nunito Sans",
      font_weight: "800",
      font_size: ratio === "9:16" ? "5.5 vmin" : "4.5 vmin",
      fill_color: "#ffffff",
      shadow_color: "rgba(0,0,0,0.55)",
      shadow_blur: "1.5 vmin",
      text_alignment: "center",
      x_alignment: "50%",
      y_alignment: "50%",
    });
  }

  // Brand bar
  source.elements.push({
    type: "rectangle",
    y: "100%",
    x: "50%",
    y_alignment: "100%",
    width: "100%",
    height: "1.2 vmin",
    fill_color: "#c30017",
  });

  const r = await fetch("https://api.creatomate.com/v1/renders", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (!r.ok) {
    const txt = await r.text();
    await sb.from("creative_outputs").update({ status: "error", error: txt.slice(0, 500) }).eq("id", row!.id);
    return json({ error: "creatomate_error", detail: txt }, 502);
  }
  const renders = await r.json();
  const render = Array.isArray(renders) ? renders[0] : renders;
  await sb
    .from("creative_outputs")
    .update({ meta: { duration: dur, caption, creatomate_id: render.id, status: render.status } })
    .eq("id", row!.id);
  return json({ output_id: row!.id, render_id: render.id, status: render.status });
}

async function handleKenBurnsPoll(req: Request) {
  const key = await getCreatomateKey();
  if (!key) return json({ error: "creatomate_not_configured" }, 412);
  const { output_id } = await req.json();
  const sb = admin();
  const { data: row } = await sb.from("creative_outputs").select("*").eq("id", output_id).single();
  if (!row) return json({ error: "not found" }, 404);
  const renderId = row.meta?.creatomate_id;
  if (!renderId) return json({ error: "no render id" }, 400);

  const r = await fetch(`https://api.creatomate.com/v1/renders/${renderId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return json({ error: "poll failed", detail: await r.text() }, 502);
  const render = await r.json();

  if (render.status === "succeeded" && render.url) {
    await sb
      .from("creative_outputs")
      .update({ status: "done", url: render.url, meta: { ...row.meta, status: render.status } })
      .eq("id", output_id);
  } else if (render.status === "failed") {
    await sb
      .from("creative_outputs")
      .update({ status: "error", error: render.error_message ?? "render failed" })
      .eq("id", output_id);
  } else {
    await sb
      .from("creative_outputs")
      .update({ meta: { ...row.meta, status: render.status } })
      .eq("id", output_id);
  }
  return json({ status: render.status, url: render.url ?? null });
}

// ---------- Router ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) return json({ error: "auth required" }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";

  try {
    switch (action) {
      case "setup-check":
        return await handleSetupCheck();
      case "save-key":
        return await handleSaveKey(req, user);
      case "reformat":
        return await handleReformat(req);
      case "copy-iterate":
        return await handleCopyIterate(req);
      case "kenburns-render":
        return await handleKenBurnsRender(req);
      case "kenburns-poll":
        return await handleKenBurnsPoll(req);
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    console.error("creative-studio-api error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});