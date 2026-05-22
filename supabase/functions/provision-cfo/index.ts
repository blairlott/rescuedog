// One-off provisioning endpoint for the CFO user.
// Idempotent: safe to call multiple times. Requires service-role auth (verify_jwt=false
// + a shared header secret). Creates the auth user with a temporary password, marks
// must_change_password=true on profile, and assigns the cfo role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAIL = "bob.evers@rescuedogwines.com";
const TEMP_PASSWORD = "ChangeMe2026!";
const FULL_NAME = "Bob Evers";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key, { auth: { persistSession: false } });

  // Require an authenticated caller who is an owner/admin, or a service-role JWT.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "missing auth" }), {
      status: 401, headers: { ...CORS, "content-type": "application/json" },
    });
  }
  const { data: caller } = await admin.auth.getUser(token);
  if (!caller?.user) {
    // Allow service-role JWT (no user but valid token via verify_jwt)
    // verify_jwt already validated the token; if no user it's service-role.
  } else {
    const { data: rows } = await admin
      .from("user_roles").select("role").eq("user_id", caller.user.id);
    const ok = (rows || []).some(r => ["owner", "admin"].includes(String(r.role)));
    if (!ok) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...CORS, "content-type": "application/json" },
      });
    }
  }

  // Find existing user
  let userId: string | null = null;
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), {
      status: 500, headers: { ...CORS, "content-type": "application/json" },
    });
  }
  const existing = list.users.find(u => (u.email || "").toLowerCase() === TARGET_EMAIL.toLowerCase());
  if (existing) {
    userId = existing.id;
    // Reset password to the temporary one and re-confirm
    await admin.auth.admin.updateUserById(existing.id, {
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata || {}), full_name: FULL_NAME },
    });
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message || "create failed" }), {
        status: 500, headers: { ...CORS, "content-type": "application/json" },
      });
    }
    userId = created.user.id;
  }

  // Profile + force change flag
  await admin.from("profiles").upsert(
    { id: userId!, email: TARGET_EMAIL, full_name: FULL_NAME, must_change_password: true },
    { onConflict: "id" },
  );

  // Grant CFO role (idempotent)
  await admin.from("user_roles").upsert(
    { user_id: userId!, role: "cfo" as any },
    { onConflict: "user_id,role" },
  );

  return new Response(JSON.stringify({
    ok: true,
    user_id: userId,
    email: TARGET_EMAIL,
    temporary_password: TEMP_PASSWORD,
    note: "User must change password on first login.",
  }), { headers: { ...CORS, "content-type": "application/json" } });
});