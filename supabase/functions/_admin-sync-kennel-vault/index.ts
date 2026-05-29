// One-off maintenance: sync KENNEL_INGEST_SECRET from Edge Function env into
// Supabase Vault so cron jobs that pull via vault.decrypted_secrets get the
// same value the function verifies against. Gated by service-role JWT.
// Default: dry-run probe. Pass {"write":true} to upsert via public.sync_kennel_ingest_vault.
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
  if (req.headers.get("Authorization") !== `Bearer ${SR}`) {
    return J(401, { error: "service-role bearer required" });
  }

  const secret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  if (!secret) return J(500, { error: "KENNEL_INGEST_SECRET env not set" });

  const probe = {
    env_len: secret.length,
    env_first4: secret.slice(0, 4),
    env_last4: secret.slice(-4),
  };

  let write = false;
  try { write = (await req.json())?.write === true; } catch { /* no body */ }

  if (!write) return J(200, { ok: true, mode: "probe", ...probe });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, SR, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("sync_kennel_ingest_vault", { p_value: secret });
  if (error) return J(500, { error: error.message, ...probe });
  return J(200, { ok: true, ...probe, vault_result: data });
});