// AI-powered merch curator using Lovable AI Gateway.
// Modes:
//  - "enhance_sku": generate short/long descriptions, badges, collection for one SKU
//  - "suggest_hero": pick 4 hero SKUs from current catalog with reasoning
//
// Uses google/gemini-3-flash-preview by default (cheapest, fastest).

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_CONTEXT = `You are the merchandising curator for Rescue Dog Wines, a wine brand
where every bottle funds shelter dogs. Voice: warm, witty, confident, never corny.
Audience: wine drinkers + dog lovers, 30-65, gift-minded. Brand colors: red #c30017, black, grey.
Always tie merch back to the rescue mission when natural.`;

async function callAI(messages: any[], tools?: any[]) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const body: any = { model: "google/gemini-3-flash-preview", messages };
  if (tools) { body.tools = tools; body.tool_choice = { type: "function", function: { name: tools[0].function.name } }; }
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 429) throw new Error("Rate limit hit, please try again in a moment.");
  if (r.status === 402) throw new Error("AI credits exhausted — top up at Settings → Workspace → Usage.");
  if (!r.ok) throw new Error(`AI gateway ${r.status}: ${await r.text()}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { mode, sku_id } = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (mode === "enhance_sku") {
      if (!sku_id) return new Response(JSON.stringify({ error: "sku_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: sku } = await admin.from("dropship_skus").select("*").eq("id", sku_id).single();
      if (!sku) return new Response(JSON.stringify({ error: "SKU not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const tools = [{
        type: "function",
        function: {
          name: "set_merch_copy",
          description: "Generate Shopify-grade merchandising copy for a Rescue Dog Wines product",
          parameters: {
            type: "object",
            properties: {
              short_description: { type: "string", description: "1-line tagline, max 80 chars, punchy and on-brand" },
              long_description: { type: "string", description: "2-3 sentence product description for the PDP" },
              category: { type: "string", enum: ["apparel","drinkware","accessories","stickers","home","pet","gift","other"] },
              collection: { type: "string", enum: ["Best of Rescue Dog","Wine Lovers","Dog Lovers","Gift Ideas","Limited Drops","New Arrivals"] },
              badges: { type: "array", items: { type: "string", enum: ["New","Best Seller","Limited","Staff Pick","Seasonal","Eco"] }, maxItems: 3 },
            },
            required: ["short_description","long_description","category","collection","badges"],
          },
        },
      }];

      const data = await callAI([
        { role: "system", content: BRAND_CONTEXT },
        { role: "user", content: `Curate this product: ${sku.product_title}. Current SKU: ${sku.sku}. Vendor type: ${sku.fulfillment_mode}. Current short: "${sku.short_description || "(none)"}". Generate fresh merchandising copy.` },
      ], tools);

      const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
      await admin.from("dropship_skus").update({
        short_description: args.short_description,
        long_description: args.long_description,
        category: args.category,
        collection: args.collection,
        badges: args.badges,
        ai_curated_at: new Date().toISOString(),
      }).eq("id", sku_id);

      return new Response(JSON.stringify({ ok: true, ...args }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "suggest_hero") {
      const { data: skus } = await admin.from("dropship_skus").select("id,sku,product_title,category,collection,retail_cents,mock_star_rating").eq("is_active", true).limit(50);
      const tools = [{
        type: "function",
        function: {
          name: "pick_heroes",
          description: "Pick the 4 hero products to feature on the merch homepage",
          parameters: {
            type: "object",
            properties: {
              hero_sku_ids: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
              reasoning: { type: "string" },
            },
            required: ["hero_sku_ids","reasoning"],
          },
        },
      }];
      const data = await callAI([
        { role: "system", content: BRAND_CONTEXT },
        { role: "user", content: `Pick the 4 best hero products from this catalog to feature on the homepage. Mix categories. Catalog: ${JSON.stringify(skus)}` },
      ], tools);
      const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
      // Reset and apply
      await admin.from("dropship_skus").update({ is_featured: false }).eq("is_active", true);
      for (const id of args.hero_sku_ids || []) {
        await admin.from("dropship_skus").update({ is_featured: true, ai_curated_at: new Date().toISOString() }).eq("id", id);
      }
      return new Response(JSON.stringify({ ok: true, ...args }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("merch-curator error", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});