// shopify-to-vs-merch-migrate
//
// DRY-RUN migration planner. For every existing dropship_skus row whose
// retail source is Shopify, emit a plan describing whether a corresponding
// Vinoshipper non-wine product needs to be created, updated, or skipped.
// No writes to VS or Shopify in this phase.
//
// See mem/plans/v3-shopify-to-vs-merch-migration.md.
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: skus, error } = await supabase
    .from("dropship_skus")
    .select(
      "id,sku,product_title,partner_id,retail_cents,cost_cents,vinoshipper_product_id,fulfillment_mode,is_active",
    )
    .eq("is_active", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const plan = (skus ?? []).map((s) => {
    const vsId = String(s.vinoshipper_product_id ?? "");
    if (!vsId) {
      return { sku: s.sku, action: "create_in_vs", reason: "no_vs_product_id" };
    }
    if (vsId.startsWith("vs_sim_")) {
      return { sku: s.sku, action: "create_in_vs", reason: "simulated_only" };
    }
    return { sku: s.sku, action: "skip", reason: "already_provisioned", vsId };
  });

  const summary = plan.reduce<Record<string, number>>((acc, p) => {
    acc[p.action] = (acc[p.action] ?? 0) + 1;
    return acc;
  }, {});

  return new Response(
    JSON.stringify({ ok: true, dryRun: true, summary, plan }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});