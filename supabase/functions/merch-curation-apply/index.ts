import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Apply an admin-approved curation action. Called from the dashboard after a
// store admin clicks "Approve". Requires a logged-in dropship manager.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: corsHeaders });

    const { data: ok } = await supabase.rpc("is_dropship_manager", { _user_id: user.id });
    if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

    const { action_id, decision, note } = await req.json();
    if (!action_id || !["approve", "reject"].includes(decision)) {
      return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: corsHeaders });
    }

    const { data: action, error: aErr } = await supabase
      .from("merch_curation_actions").select("*").eq("id", action_id).single();
    if (aErr || !action) throw aErr ?? new Error("not found");

    if (decision === "reject") {
      await supabase.from("merch_curation_actions").update({
        status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: note ?? null,
      }).eq("id", action_id);
      return new Response(JSON.stringify({ ok: true, decision }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Approve: apply the change --------------------------------------
    let appliedNote = "";
    switch (action.action_type) {
      case "remove_unavailable": {
        await supabase.from("dropship_skus").update({ is_active: false }).eq("id", action.sku_id);
        if (action.replacement_sku_id) {
          await supabase.from("dropship_skus").update({ is_featured: true }).eq("id", action.replacement_sku_id);
          appliedNote = "SKU deactivated and replacement promoted.";
        } else {
          appliedNote = "SKU deactivated. No replacement selected.";
        }
        break;
      }
      case "adjust_price": {
        const change = action.proposed_change ?? {};
        await supabase.from("dropship_skus").update({
          retail_cents: change.retail_cents,
          cost_cents: change.cost_cents,
          target_margin_percent: change.target_margin_percent,
        }).eq("id", action.sku_id);
        appliedNote = "New retail price applied.";
        break;
      }
      case "restock_alert": {
        appliedNote = "Acknowledged. SKU left active.";
        break;
      }
      case "add_recommendation": {
        const change = action.proposed_change ?? {};
        // Simulated insert under a default partner so admins can finish setup.
        const { data: partner } = await supabase
          .from("dropship_partners").select("id").limit(1).maybeSingle();
        if (partner) {
          await supabase.from("dropship_skus").insert({
            partner_id: partner.id,
            sku: `MERCH-${Date.now()}`,
            product_title: change.title,
            category: change.category,
            retail_cents: change.retail_cents,
            cost_cents: change.cost_cents,
            is_active: false, // wait for admin to add image + finalize
            ai_curated_at: new Date().toISOString(),
          });
          appliedNote = "Draft SKU created (inactive). Add imagery and activate when ready.";
        } else {
          appliedNote = "No partner available to host new SKU.";
        }
        break;
      }
      case "margin_warning":
      case "replace_sku":
      default:
        appliedNote = "Recorded.";
    }

    await supabase.from("merch_curation_actions").update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      applied_at: new Date().toISOString(),
      review_note: note ? `${note} | ${appliedNote}` : appliedNote,
    }).eq("id", action_id);

    return new Response(JSON.stringify({ ok: true, decision, appliedNote }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});