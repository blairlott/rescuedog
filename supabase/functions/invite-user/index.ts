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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) throw new Error("Invalid token");

    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin_or_owner", { _user_id: caller.id });
    if (!isAdmin) throw new Error("Not authorized — only admins and owners can invite team members");

    const body = await req.json();
    const email: string = String(body.email || "").trim().toLowerCase();
    const full_name: string = String(body.full_name || "").trim();
    // Accept both single role (legacy) and roles[]
    const rawRoles: string[] = Array.isArray(body.roles)
      ? body.roles
      : body.role
      ? [body.role]
      : [];
    const roles = Array.from(new Set(rawRoles.filter(Boolean)));
    const redirectTo: string =
      body.redirect_to || `${req.headers.get("origin") || ""}/reset-password`;
    const surface: string = ["cms", "crm", "admin"].includes(String(body.surface))
      ? String(body.surface)
      : "admin";
    const expiresInDays: number = Number(body.expires_in_days) > 0 ? Number(body.expires_in_days) : 7;

    if (!email) throw new Error("Email is required");
    if (roles.length === 0) throw new Error("At least one role is required");

    // Owner-only check
    if (roles.includes("owner")) {
      const { data: isOwner } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", caller.id)
        .eq("role", "owner")
        .maybeSingle();
      if (!isOwner) throw new Error("Only an owner can grant the owner role");
    }

    // Find or create user
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email
    );

    let userId: string;
    let alreadyExisted = false;

    if (existing) {
      userId = existing.id;
      alreadyExisted = true;
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: crypto.randomUUID(),
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (createError) throw createError;
      userId = newUser.user.id;
    }

    // Approve profile
    await supabaseAdmin
      .from("profiles")
      .update({ approved: true, ...(full_name ? { full_name } : {}) })
      .eq("id", userId);

    // Insert all requested roles (idempotent)
    const added: string[] = [];
    const skipped: string[] = [];
    for (const role of roles) {
      const { data: exists } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", role as any)
        .maybeSingle();
      if (exists) {
        skipped.push(role);
        continue;
      }
      const { error: insErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: role as any });
      if (insErr) throw insErr;
      added.push(role);
    }

    // Generate a recovery link so the new user can set their password
    let recovery_link: string | null = null;
    try {
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: alreadyExisted ? "recovery" : "recovery",
        email,
        options: { redirectTo },
      });
      recovery_link = linkData?.properties?.action_link ?? null;
    } catch (_) {
      recovery_link = null;
    }

    // Record the invitation so we can show pending/accepted/expired status.
    const expires_at = new Date(Date.now() + expiresInDays * 86400 * 1000).toISOString();
    let invitation_id: string | null = null;
    try {
      const { data: invRow } = await supabaseAdmin
        .from("team_invitations")
        .insert({
          email,
          full_name: full_name || null,
          roles,
          surface,
          invited_by: caller.id,
          invited_user_id: userId,
          recovery_link,
          expires_at,
          // If user already had a password & has signed in, mark accepted immediately.
          accepted_at: alreadyExisted && existing?.last_sign_in_at ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      invitation_id = invRow?.id ?? null;
    } catch (_) {
      invitation_id = null;
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        invitation_id,
        already_existed: alreadyExisted,
        roles_added: added,
        roles_skipped: skipped,
        recovery_link,
        expires_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
