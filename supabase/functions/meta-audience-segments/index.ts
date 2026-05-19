// CRUD for Meta audience segments. ad_ops/admin only.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: claims, error: authErr } = await userClient.auth.getClaims(auth.slice(7));
  if (authErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const uid = claims.claims.sub as string;
  const { data: isOps } = await admin.rpc("is_ad_ops", { _user_id: uid });
  if (!isOps) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data, error } = await admin.from("meta_audiences").select("*").order("segment_name");
      if (error) throw error;
      return new Response(JSON.stringify({ segments: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const body = await req.json();
      // Dry-run SQL validation for user_list segments
      if (body.segment_kind !== "meta_rule_based" && body.segment_query) {
        const { error: dryErr } = await admin.rpc("run_meta_segment_sql", { _sql: body.segment_query, _limit: 1 });
        if (dryErr) {
          return new Response(JSON.stringify({ error: "sql_validation_failed", detail: dryErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      if (req.method === "POST") {
        const { data, error } = await admin.from("meta_audiences").insert(body).select().single();
        if (error) throw error;
        return new Response(JSON.stringify({ segment: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data, error } = await admin.from("meta_audiences").update(body).eq("id", id).select().single();
        if (error) throw error;
        return new Response(JSON.stringify({ segment: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (req.method === "DELETE") {
      if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await admin.from("meta_audiences").delete().eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});