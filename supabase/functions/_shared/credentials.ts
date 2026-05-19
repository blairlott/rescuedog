// Resolve third-party credentials from the DB-backed
// integration_credentials table, falling back to Deno env vars.
//
// Usage in an edge function:
//   import { getCredential } from "../_shared/credentials.ts";
//   const token = await getCredential(sb, "yahoo_dsp", "client_id");
//
// Lookup order:
//   1. integration_credentials (provider, credential_key, scope='live')
//   2. Deno.env.get(envFallback ?? `${PROVIDER}_${KEY}`)  (uppercased)
//
// The DB row wins so admins can rotate keys from the UI without redeploys.
import { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function getCredential(
  sb: SupabaseClient,
  provider: string,
  credentialKey: string,
  opts: { scope?: string; envFallback?: string } = {},
): Promise<string | null> {
  const scope = opts.scope ?? "live";
  try {
    const { data } = await sb
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", provider)
      .eq("credential_key", credentialKey)
      .eq("scope", scope)
      .maybeSingle();
    const v = data?.credential_value;
    if (v && String(v).trim().length > 0) return String(v);
  } catch (_e) {
    // table missing or RLS denial — fall through to env
  }
  const envName = opts.envFallback ?? `${provider.toUpperCase()}_${credentialKey.toUpperCase()}`;
  return Deno.env.get(envName) ?? null;
}

export async function getCredentials(
  sb: SupabaseClient,
  provider: string,
  keys: Array<{ key: string; envFallback?: string }>,
  scope: string = "live",
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(
    keys.map(async ({ key, envFallback }) => {
      out[key] = await getCredential(sb, provider, key, { scope, envFallback });
    }),
  );
  return out;
}