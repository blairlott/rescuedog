// Pushes a dropship_skus row to Vinoshipper as a non-wine product.
// Until VINOSHIPPER_API_KEY is configured, returns a simulated vinoshipper_product_id
// so the catalog flow is fully exercisable.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { sku_id } = await req.json();
    if (!sku_id) {
      return new Response(JSON.stringify({ error: "sku_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sku, error: sErr } = await admin.from("dropship_skus").select("*").eq("id", sku_id).single();
    if (sErr || !sku) {
      return new Response(JSON.stringify({ error: "SKU not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const vsKey = Deno.env.get("VINOSHIPPER_API_KEY");
    const simulate = !vsKey;

    let vinoshipper_product_id: string;
    if (simulate) {
      vinoshipper_product_id = sku.vinoshipper_product_id || `vs_sim_${Date.now()}_${sku.sku.replace(/[^a-z0-9]/gi, "")}`;
    } else {
      // Live mode: POST /api/v3/products to Vinoshipper as non-wine
      const res = await fetch("https://vinoshipper.com/api/v3/products", {
        method: "POST",
        headers: { Authorization: `Bearer ${vsKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sku.product_title,
          sku: sku.sku,
          type: "non_wine",
          price_cents: sku.retail_cents,
          image_url: sku.product_image_url,
        }),
      });
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `Vinoshipper ${res.status}: ${await res.text()}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const data = await res.json();
      vinoshipper_product_id = String(data.id);
    }

    const { error: uErr } = await admin.from("dropship_skus")
      .update({ vinoshipper_product_id, last_synced_at: new Date().toISOString() })
      .eq("id", sku_id);
    if (uErr) throw uErr;

    await admin.from("dropship_events").insert({
      event_type: simulate ? "vs_sync_simulated" : "vs_sync_live",
      partner_id: sku.partner_id,
      message: `Synced "${sku.product_title}" → Vinoshipper as ${vinoshipper_product_id}`,
      payload: { sku_id, vinoshipper_product_id, simulated: simulate },
    });

    return new Response(JSON.stringify({ simulated: simulate, vinoshipper_product_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-to-vinoshipper error", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});