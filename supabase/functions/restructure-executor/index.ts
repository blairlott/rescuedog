import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization") || "";
  if (auth.replace(/^Bearer\s+/i, "") !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "service role required" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const { proposal_id } = await req.json();
    if (!proposal_id) throw new Error("proposal_id required");

    const { data: rec, error: e1 } = await db.from("restructure_proposals").select("*").eq("id", proposal_id).single();
    if (e1) throw e1;
    if (rec.status !== "approved") throw new Error(`not approved (status=${rec.status})`);

    const kind: string = rec.target_kind;
    const payload: any = rec.target_payload || {};
    let result: any = { kind };
    let success = true;

    try {
      if (kind === "app_setting" && payload.key) {
        const { error } = await db.from("app_settings").upsert({ key: payload.key, value: payload.value });
        if (error) throw error;
        result.set = { key: payload.key, value: payload.value };
      } else if (kind === "experiment_promote" && payload.experiment_id && payload.winning_variant_id) {
        // Mark experiment complete and bump winner weight; freeze losers.
        const { error: e2 } = await db.from("experiments").update({ status: "concluded" }).eq("id", payload.experiment_id);
        if (e2) throw e2;
        await db.from("experiment_variants").update({ weight: 0 }).eq("experiment_id", payload.experiment_id);
        await db.from("experiment_variants").update({ weight: 100 }).eq("id", payload.winning_variant_id);
        result.promoted = payload.winning_variant_id;
      } else if (kind === "feature_flag" && payload.key) {
        await db.from("app_settings").upsert({ key: `flag_${payload.key}`, value: payload.enabled ?? true });
        result.flag = payload.key;
      } else {
        // Generic: just record the intent — manual deploy still required.
        result.note = "no executor for this target_kind; manual deploy required";
      }
    } catch (err: any) {
      success = false;
      result.error = err?.message || String(err);
    }

    await db.rpc("mark_restructure_executed", { _id: proposal_id, _success: success, _result: result });
    return new Response(JSON.stringify({ success, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});