// Lists products from a Printify shop for admin to import.
// In simulation mode (no PRINTIFY_API_KEY or partner.simulation_mode=true),
// returns a mock catalog so the import UI is fully testable pre-launch.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MOCK_CATALOG = [
  { id: "pf_mock_1001", title: "Rescue Dog Tee — Heather Black", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400", variants: [
    { id: "v_1001_s", title: "S", price_cents: 2200, cost_cents: 1100, sku: "RDW-TEE-S" },
    { id: "v_1001_m", title: "M", price_cents: 2200, cost_cents: 1100, sku: "RDW-TEE-M" },
    { id: "v_1001_l", title: "L", price_cents: 2200, cost_cents: 1100, sku: "RDW-TEE-L" },
  ]},
  { id: "pf_mock_1002", title: "Rescue Dog Hoodie — Black", image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400", variants: [
    { id: "v_1002_m", title: "M", price_cents: 4800, cost_cents: 2400, sku: "RDW-HOOD-M" },
    { id: "v_1002_l", title: "L", price_cents: 4800, cost_cents: 2400, sku: "RDW-HOOD-L" },
  ]},
  { id: "pf_mock_1003", title: "Rescue Dog Trucker Hat", image: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400", variants: [
    { id: "v_1003_os", title: "One Size", price_cents: 2800, cost_cents: 1300, sku: "RDW-HAT-OS" },
  ]},
  { id: "pf_mock_1004", title: "Vineyard Tote Bag", image: "https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?w=400", variants: [
    { id: "v_1004_os", title: "One Size", price_cents: 1800, cost_cents: 900, sku: "RDW-TOTE-OS" },
  ]},
];

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

    const { partner_id } = await req.json();
    if (!partner_id) {
      return new Response(JSON.stringify({ error: "partner_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: partner, error: pErr } = await admin.from("dropship_partners").select("*").eq("id", partner_id).single();
    if (pErr || !partner) {
      return new Response(JSON.stringify({ error: "Partner not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("PRINTIFY_API_KEY");
    const simulate = partner.simulation_mode || !apiKey || partner.vendor_type !== "printify";

    if (simulate) {
      return new Response(JSON.stringify({ simulated: true, products: MOCK_CATALOG }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Live mode (post May 18) — call Printify
    const shopId = (partner.vendor_credentials as any)?.shop_id;
    if (!shopId) {
      return new Response(JSON.stringify({ error: "Missing shop_id in partner credentials" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const res = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Printify ${res.status}: ${await res.text()}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await res.json();
    return new Response(JSON.stringify({ simulated: false, products: data.data || [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("printify-import-products error", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});