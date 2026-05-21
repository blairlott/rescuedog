// Autonomous curation pass: for each ingested original that has not yet been
// AI-enhanced, queue (a) an HD authentic enhancement and (b) one creative scene
// variant. Originals are always preserved — derivatives land in `pending`
// with metadata.parent_asset_id pointing back, so a human can review and
// approve them from the Creative Studio AI Review panel.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SCENE_PRESETS = [
  "scene_vineyard",
  "scene_picnic",
  "scene_kitchen",
  "scene_fireside",
  "scene_beach",
];

const ORIGINAL_SOURCES = ["legacy_site", "instagram", "upload", "shopify"];

async function invokeEnhance(asset_id: string, preset: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/enhance-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ asset_id, preset, variants: 1, auto: true }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`enhance-image ${preset} failed: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(20, Number(body.limit) || 5));
    const includeScene = body.scene !== false; // default true

    // Originals that are approved or pending and don't yet have any AI-enhanced child.
    const { data: candidates, error: cErr } = await supabase
      .from("media_assets")
      .select("id, source, status, image_url, width, height")
      .in("source", ORIGINAL_SOURCES)
      .in("status", ["approved", "pending"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (cErr) throw cErr;

    const { data: existing, error: eErr } = await supabase
      .from("media_assets")
      .select("metadata")
      .eq("source", "ai_enhanced")
      .limit(2000);
    if (eErr) throw eErr;
    const enhancedParents = new Set<string>(
      (existing ?? [])
        .map((r) => (r.metadata as { parent_asset_id?: string } | null)?.parent_asset_id)
        .filter((x): x is string => Boolean(x)),
    );

    const todo = (candidates ?? []).filter((c) => !enhancedParents.has(c.id)).slice(0, limit);

    const results: Array<{ asset_id: string; enhance?: string; scene?: string; error?: string }> = [];
    for (const c of todo) {
      const entry: { asset_id: string; enhance?: string; scene?: string; error?: string } = { asset_id: c.id };
      try {
        await invokeEnhance(c.id, "hd_authentic");
        entry.enhance = "ok";
      } catch (e) {
        entry.error = e instanceof Error ? e.message : String(e);
      }
      if (includeScene && !entry.error) {
        try {
          const scene = SCENE_PRESETS[Math.floor(Math.random() * SCENE_PRESETS.length)];
          await invokeEnhance(c.id, scene);
          entry.scene = scene;
        } catch (e) {
          entry.error = (entry.error ? entry.error + "; " : "") + (e instanceof Error ? e.message : String(e));
        }
      }
      results.push(entry);
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("auto-curate-media error", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});