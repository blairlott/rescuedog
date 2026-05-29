// One-off maintenance: sync KENNEL_INGEST_SECRET from Edge Function env into
// Supabase Vault so cron jobs that pull via vault.decrypted_secrets get the
// same value the function verifies against. Gated by service-role JWT.
// Default: dry-run probe (length + first4/last4). Pass {"write":true} to upsert.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SR}`) return J(401, { error: "service-role bearer required" });

  const secret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  if (!secret) return J(500, { error: "KENNEL_INGEST_SECRET env not set" });

  const probe = {
    env_len: secret.length,
    env_first4: secret.slice(0, 4),
    env_last4: secret.slice(-4),
  };

  let write = false;
  try {
    const body = await req.json();
    write = body?.write === true;
  } catch { /* no body */ }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, SR, { auth: { persistSession: false } });

  if (!write) return J(200, { ok: true, mode: "probe", ...probe });

  // Check if vault row exists; create or update accordingly.
  const { data: existing, error: selErr } = await admin
    .schema("vault" as any)
    .from("secrets")
    .select("id")
    .eq("name", "KENNEL_INGEST_SECRET")
    .maybeSingle();
  if (selErr) return J(500, { error: `vault select: ${selErr.message}`, ...probe });

  const description =
    "Shared secret for cron → instacart-autopilot and other ingest endpoints. " +
    "Must match Edge Function env var of same name.";

  if (existing?.id) {
    const { error } = await admin.rpc("vault_update_secret_proxy" as any, {});
    // Fallback: call vault.update_secret via raw SQL through a SECURITY DEFINER function
    // is overkill; instead use the supabase-js .rpc on a known helper if present, else
    // perform an UPDATE — but vault.secrets is restricted. Use the SQL function:
    if (error) {
      const { error: e2 } = await admin.rpc("update_kennel_ingest_vault", { p_value: secret });
      if (e2) return J(500, { error: `vault update: ${e2.message}`, ...probe });
    }
    return J(200, { ok: true, mode: "update", id: existing.id, ...probe });
  }

  const { error: insErr } = await admin.rpc("create_kennel_ingest_vault", {
    p_value: secret,
    p_description: description,
  });
  if (insErr) return J(500, { error: `vault create: ${insErr.message}`, ...probe });
  return J(200, { ok: true, mode: "create", ...probe });
});