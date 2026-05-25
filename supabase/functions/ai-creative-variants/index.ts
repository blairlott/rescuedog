// Phase 4 #24 — AI-generated ad copy + image variants for top SKUs.
// Nightly run produces N copy variants per qualifying SKU and queues them
// in ai_creative_variants (status='pending') for human approval.
// Image generation is opt-in per call (POST { include_images: true }) to
// keep nightly cost predictable.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { verifyCronSecret, logCronRun } from "../_shared/cronAlert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const COPY_MODEL = "google/gemini-2.5-flash";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";

async function genCopy(apiKey: string, productName: string, varietal: string | null, seed: string) {
  const sys = `You write Meta/Instagram ad copy for Rescue Dog Wines — a mission-driven winery whose tagline is "helping dogs find their forever home." Voice: warm, confident, never preachy. Never claim free shipping. Never quantify impact (no "X homes saved"). Output JSON only: { headline, primary_text, cta } where headline <= 40 chars, primary_text <= 125 chars, cta one of "Shop Now","Learn More","Sign Up".`;
  const user = `Product: ${productName}${varietal ? ` (${varietal})` : ""}. Hook seed: ${seed}. Return JSON.`;
  const r = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: COPY_MODEL,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const txt = j.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(txt);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!(await verifyCronSecret(req, "ai-creative-variants"))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: settings } = await admin
    .from("app_settings")
    .select("key,value")
    .in("key", ["ai_creative_autogen_enabled", "ai_creative_top_sku_limit"]);
  const map = Object.fromEntries((settings ?? []).map((r: any) => [r.key, r.value]));
  if (map.ai_creative_autogen_enabled === false) {
    return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const limit = Number(map.ai_creative_top_sku_limit ?? 5);
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "LOVABLE_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Top SKUs = active wines sorted by sort_order asc (curator-defined priority)
  const { data: wines } = await admin
    .from("wine_products")
    .select("handle,title,varietal,vinoshipper_sku,image_url")
    .eq("is_active", true)
    .eq("in_stock", true)
    .order("sort_order")
    .limit(limit);

  const seeds = ["bold rescue origin", "shipping included", "limited release", "tasting-notes lead", "mission proof"];
  const created: any[] = [];

  for (const w of wines ?? []) {
    for (let i = 0; i < 3; i++) {
      const seed = seeds[(i + created.length) % seeds.length];
      try {
        const out = await genCopy(apiKey, w.title, w.varietal, seed);
        const { data: row, error } = await admin.from("ai_creative_variants").insert({
          sku: w.vinoshipper_sku ?? null,
          product_handle: w.handle,
          variant_kind: "copy",
          platform: "meta",
          prompt_seed: seed,
          headline: out.headline ?? null,
          primary_text: out.primary_text ?? null,
          cta: out.cta ?? "Shop Now",
          image_url: w.image_url ?? null,
          model_used: COPY_MODEL,
          status: "pending",
          metadata: { source: "ai-creative-variants", raw: out },
        }).select().single();
        if (!error) created.push({ id: row?.id, handle: w.handle, seed });
      } catch (e: any) {
        created.push({ handle: w.handle, error: e.message });
      }
    }
  }

  await logCronRun("ai-creative-variants", "ok", { httpStatus: 200, metadata: { count: created.length } });
  return new Response(JSON.stringify({ ok: true, count: created.length, created }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logCronRun("ai-creative-variants", "error", { httpStatus: 500, error: msg });
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});