import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Self-managing merch curator. Scans dropship_skus, simulates vendor
// availability + cost drift, and proposes actions to merch_curation_actions.
// All actions land as `pending` so a store admin can approve in the dashboard.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const simulate = body.simulate !== false; // default to simulation until vendor APIs land

    const { data: skus, error } = await supabase
      .from("dropship_skus")
      .select("*")
      .eq("is_active", true)
      .eq("auto_curate", true);
    if (error) throw error;

    const proposals: any[] = [];
    const now = new Date().toISOString();

    for (const sku of skus ?? []) {
      // --- Simulated vendor availability roll -------------------------------
      let availability = sku.vendor_availability as string;
      let simCost = sku.cost_cents as number;
      if (simulate) {
        const r = Math.random();
        if (r < 0.08) availability = "out_of_stock";
        else if (r < 0.14) availability = "discontinued";
        else if (r < 0.22) availability = "low_stock";
        else availability = "in_stock";
        // simulate +/- 15% cost drift
        simCost = Math.max(100, Math.round(sku.cost_cents * (0.85 + Math.random() * 0.3)));
      }

      await supabase
        .from("dropship_skus")
        .update({ vendor_availability: availability, last_availability_check: now })
        .eq("id", sku.id);

      // --- Rule 1: discontinued / out of stock -> propose replacement -------
      if (availability === "discontinued" || availability === "out_of_stock") {
        // find a similar in-category in-stock alternative
        const { data: alts } = await supabase
          .from("dropship_skus")
          .select("id, sku, product_title, retail_cents, cost_cents, product_image_url, category")
          .eq("category", sku.category)
          .eq("is_active", true)
          .neq("id", sku.id)
          .in("vendor_availability", ["in_stock", "low_stock"])
          .limit(3);

        const replacement = alts?.[0];
        proposals.push({
          sku_id: sku.id,
          action_type: availability === "discontinued" ? "remove_unavailable" : "restock_alert",
          status: "pending",
          reason: `Vendor reports product ${availability.replace("_", " ")}.`,
          ai_confidence: 0.92,
          current_snapshot: {
            sku: sku.sku,
            title: sku.product_title,
            availability,
          },
          proposed_change: { is_active: false },
          replacement_sku_id: replacement?.id ?? null,
          proposed_replacement: replacement ?? null,
          source: simulate ? "simulated_scan" : "vendor_api_scan",
        });
        continue;
      }

      // --- Rule 2: margin slipped below minimum -> propose price bump -------
      const newRetail = sku.retail_cents;
      const margin = newRetail > 0 ? ((newRetail - simCost) / newRetail) * 100 : 0;
      const minMargin = sku.min_margin_percent ?? 30;
      const targetMargin = sku.target_margin_percent ?? 50;
      if (margin < minMargin) {
        const proposedRetail = Math.round(simCost / (1 - targetMargin / 100) / 50) * 50; // round to $0.50
        proposals.push({
          sku_id: sku.id,
          action_type: "adjust_price",
          status: "pending",
          reason: `Margin dropped to ${margin.toFixed(1)}% (min ${minMargin}%). Vendor cost is now $${(simCost / 100).toFixed(2)}.`,
          ai_confidence: 0.85,
          current_snapshot: {
            retail_cents: sku.retail_cents,
            cost_cents: sku.cost_cents,
            margin_percent: Number(margin.toFixed(1)),
          },
          proposed_change: {
            retail_cents: proposedRetail,
            cost_cents: simCost,
            target_margin_percent: targetMargin,
          },
          source: simulate ? "simulated_scan" : "vendor_api_scan",
        });
        continue;
      }

      // --- Rule 3: low stock heads-up ---------------------------------------
      if (availability === "low_stock") {
        proposals.push({
          sku_id: sku.id,
          action_type: "restock_alert",
          status: "pending",
          reason: "Vendor inventory running low. Confirm reorder or surface a backup SKU.",
          ai_confidence: 0.7,
          current_snapshot: { availability },
          proposed_change: {},
          source: simulate ? "simulated_scan" : "vendor_api_scan",
        });
      }
    }

    // --- Rule 4: AI fresh-product recommendations ---------------------------
    // Suggest one new "trending" merch idea per scan (simulated until vendor catalogs are live)
    if (simulate && (skus?.length ?? 0) > 0) {
      const ideas = [
        { title: "Rescue Dog Vintage Trucker Hat", category: "headwear", retail_cents: 2800, cost_cents: 950 },
        { title: "Adopted & Adored Crewneck", category: "apparel", retail_cents: 4800, cost_cents: 1850 },
        { title: "Pawsitive Vibes Enamel Mug", category: "drinkware", retail_cents: 1800, cost_cents: 620 },
        { title: "Two Rescues, One Cork Coaster Set", category: "home", retail_cents: 2400, cost_cents: 800 },
      ];
      const pick = ideas[Math.floor(Math.random() * ideas.length)];
      proposals.push({
        sku_id: null,
        action_type: "add_recommendation",
        status: "pending",
        reason: "AI noticed a gap in the catalog and suggests adding this trending product.",
        ai_confidence: 0.6,
        current_snapshot: {},
        proposed_change: pick,
        source: "ai_recommendation",
      });
    }

    if (proposals.length > 0) {
      const { error: insErr } = await supabase.from("merch_curation_actions").insert(proposals);
      if (insErr) throw insErr;
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: skus?.length ?? 0, proposed: proposals.length, simulated: simulate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});