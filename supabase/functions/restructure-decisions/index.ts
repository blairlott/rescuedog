import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

async function callerIsAdmin(req: Request): Promise<{ ok: boolean; userId?: string }> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false };
  // Service-role shortcut for Lindy server-to-server
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return { ok: true };
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return { ok: false };
  const { data: ok } = await userClient.rpc("is_admin_or_owner", { _user_id: u.user.id });
  return { ok: Boolean(ok), userId: u.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (req.method === "GET" ? "list" : "decide");
    const admin = await callerIsAdmin(req);
    if (!admin.ok) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = svc();

    if (action === "list") {
      const status = url.searchParams.get("status") || "pending";
      const { data, error } = await db
        .from("restructure_proposals")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return new Response(JSON.stringify({ proposals: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "decide") {
      const body = await req.json().catch(() => ({}));
      const { id, decision, notes } = body as { id: string; decision: "approve" | "reject"; notes?: string };
      if (!id || !["approve", "reject"].includes(decision)) {
        return new Response(JSON.stringify({ error: "id and decision required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Use a user-context client when we have a JWT so decided_by is recorded; else service role.
      const auth = req.headers.get("Authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "");
      const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const client = isServiceRole
        ? db
        : createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
      const { data: rec, error } = await client.rpc("decide_restructure", {
        _id: id, _action: decision, _notes: notes ?? null,
      });
      if (error) throw error;

      let executed: any = null;
      if (decision === "approve") {
        // Auto-execute
        const execResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/restructure-executor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ proposal_id: id }),
        });
        executed = await execResp.json().catch(() => null);
      }

      return new Response(JSON.stringify({ proposal: rec, executed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});