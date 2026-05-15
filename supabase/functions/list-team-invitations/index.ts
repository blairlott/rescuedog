import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) throw new Error("Invalid token");
    const { data: isAdmin } = await admin.rpc("is_admin_or_owner", { _user_id: caller.id });
    if (!isAdmin) throw new Error("Not authorized");

    const url = new URL(req.url);
    const surface = url.searchParams.get("surface");
    const action = url.searchParams.get("action");

    if (req.method === "POST" && action === "revoke") {
      const { id } = await req.json();
      if (!id) throw new Error("id required");
      await admin.from("team_invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "resend") {
      const { id, redirect_to, expires_in_days } = await req.json();
      const { data: inv } = await admin.from("team_invitations").select("*").eq("id", id).single();
      if (!inv) throw new Error("invitation not found");
      let recovery_link: string | null = null;
      try {
        const { data: linkData } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: inv.email,
          options: { redirectTo: redirect_to || undefined },
        });
        recovery_link = linkData?.properties?.action_link ?? null;
      } catch (_) { recovery_link = null; }
      const days = Number(expires_in_days) > 0 ? Number(expires_in_days) : 7;
      const new_expires = new Date(Date.now() + days * 86400 * 1000).toISOString();
      await admin.from("team_invitations")
        .update({ recovery_link, expires_at: new_expires, revoked_at: null })
        .eq("id", id);
      return new Response(JSON.stringify({ success: true, recovery_link, expires_at: new_expires }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let q = admin.from("team_invitations").select("*").order("created_at", { ascending: false });
    if (surface) q = q.eq("surface", surface);
    const { data: invites } = await q;

    const userIds = Array.from(
      new Set((invites ?? []).map((i: any) => i.invited_user_id).filter(Boolean))
    );
    const signInMap: Record<string, string | null> = {};
    for (const uid of userIds) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(uid as string);
        signInMap[uid as string] = u?.user?.last_sign_in_at ?? null;
      } catch (_) { signInMap[uid as string] = null; }
    }

    const now = Date.now();
    const enriched = (invites ?? []).map((i: any) => {
      const lastSignIn = i.invited_user_id ? signInMap[i.invited_user_id] : null;
      let accepted_at: string | null = i.accepted_at;
      if (!accepted_at && lastSignIn && new Date(lastSignIn).getTime() >= new Date(i.created_at).getTime()) {
        accepted_at = lastSignIn;
      }
      let status: "accepted" | "revoked" | "expired" | "pending";
      if (accepted_at) status = "accepted";
      else if (i.revoked_at) status = "revoked";
      else if (new Date(i.expires_at).getTime() < now) status = "expired";
      else status = "pending";
      return { ...i, last_sign_in_at: lastSignIn, accepted_at, status };
    });

    for (const e of enriched) {
      const orig = (invites ?? []).find((x: any) => x.id === e.id);
      if (e.status === "accepted" && orig && !orig.accepted_at) {
        await admin.from("team_invitations").update({ accepted_at: e.accepted_at }).eq("id", e.id);
      }
    }

    return new Response(JSON.stringify({ invitations: enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
