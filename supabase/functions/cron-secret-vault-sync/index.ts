// One-shot admin tool: copies the current CRON_SECRET edge-function env value
// into vault.secrets so pg_cron jobs can pull it live via
// `(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET')`.
// The secret value never leaves the server.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Require an authenticated owner/admin caller. No cron-secret bypass here —
  // by definition the cron-secret is what we're seeding, so callers must be
  // a real human admin.
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1);
  if (!roles?.length) return json({ error: "forbidden" }, 403);

  const secretName = "CRON_SECRET";
  const value = Deno.env.get(secretName);
  if (!value) {
    return json({ error: "env_missing", details: `${secretName} env var is empty` }, 500);
  }

  // Upsert into vault.secrets via the vault helper functions. Use create_secret
  // on first run, update_secret on subsequent runs.
  const { data: existing, error: lookupErr } = await admin
    .rpc("vault_secret_id_by_name", { p_name: secretName });
  let upserted: "created" | "updated";
  if (lookupErr && lookupErr.code !== "PGRST116") {
    // Fall through: try to create; if it conflicts we'll handle.
  }

  if (existing) {
    const { error: upErr } = await admin.rpc("vault_update_secret_by_name", {
      p_name: secretName,
      p_secret: value,
    });
    if (upErr) return json({ error: "vault_update_failed", details: upErr.message }, 500);
    upserted = "updated";
  } else {
    const { error: crErr } = await admin.rpc("vault_create_secret_by_name", {
      p_name: secretName,
      p_secret: value,
    });
    if (crErr) return json({ error: "vault_create_failed", details: crErr.message }, 500);
    upserted = "created";
  }

  return json({ ok: true, secret: secretName, action: upserted });
});