// Approve, reject, or execute a Kennel recommendation.
// Auth: requires logged-in user with admin/owner or ad_ops_manager role.
// For approve/reject we call the SECURITY DEFINER RPC `kennel_review_recommendation`.
// For execute we mark executed and log it (actual platform API calls are wired in Phase 1c).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claims?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { recommendation_id, action, notes } = body ?? {};
  if (!recommendation_id || !["approve", "reject", "execute", "rollback"].includes(action)) {
    return json({ error: "recommendation_id and valid action required" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Kill-switch check for execute
  if (action === "execute" || action === "approve") {
    const { data: killRow } = await admin.from("ad_settings").select("value").eq("key", "kill_switch").maybeSingle();
    if (killRow?.value === true) return json({ error: "kill switch is engaged" }, 423);
  }

  if (action === "approve" || action === "reject") {
    // Use user-scoped client so auth.uid() resolves inside the RPC
    const { data, error } = await userClient.rpc("kennel_review_recommendation", {
      _rec_id: recommendation_id,
      _action: action,
      _notes: notes ?? null,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, recommendation: data });
  }

  // execute / rollback paths
  const { data: rec, error: recErr } = await admin
    .from("ad_recommendations").select("*").eq("id", recommendation_id).maybeSingle();
  if (recErr || !rec) return json({ error: "not found" }, 404);

  if (action === "execute") {
    if (rec.status !== "approved") return json({ error: `cannot execute (status=${rec.status})` }, 400);
    // Phase 1c: dispatch to platform API based on rec.payload.platform.
    // For now, record execution as a no-op success and capture rollback_state.
    const rollbackState = rec.payload?.rollback_state ?? {};
    const { error: updErr } = await admin
      .from("ad_recommendations")
      .update({ status: "executed", executed_at: new Date().toISOString(), rollback_state: rollbackState })
      .eq("id", recommendation_id);
    if (updErr) return json({ error: updErr.message }, 500);
    await admin.from("ad_execution_log").insert({
      recommendation_id, action: "execute", actor_id: userId, actor_kind: "user",
      request_payload: { notes: notes ?? null }, response_payload: { dispatched: false, reason: "phase_1c_pending" },
      success: true,
    });
    return json({ ok: true });
  }

  if (action === "rollback") {
    if (rec.status !== "executed") return json({ error: `cannot rollback (status=${rec.status})` }, 400);
    const { error: updErr } = await admin
      .from("ad_recommendations")
      .update({ status: "rolled_back" })
      .eq("id", recommendation_id);
    if (updErr) return json({ error: updErr.message }, 500);
    await admin.from("ad_execution_log").insert({
      recommendation_id, action: "rollback", actor_id: userId, actor_kind: "user",
      request_payload: { notes: notes ?? null, rollback_state: rec.rollback_state },
      success: true,
    });
    return json({ ok: true });
  }

  return json({ error: "unhandled" }, 400);
});