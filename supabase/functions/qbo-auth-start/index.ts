// Initiates the QuickBooks Online OAuth flow.
// Returns the Intuit authorization URL for the admin to follow.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/qbo-auth-callback`;
const SCOPE = "com.intuit.quickbooks.accounting";
const DISCOVERY_URL = "https://developer.api.intuit.com/.well-known/openid_configuration";

let _discoveryCache: { authorization_endpoint: string; token_endpoint: string } | null = null;
async function getIntuitEndpoints() {
  if (_discoveryCache) return _discoveryCache;
  const r = await fetch(DISCOVERY_URL, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`intuit discovery failed: ${r.status}`);
  const j: any = await r.json();
  _discoveryCache = {
    authorization_endpoint: j.authorization_endpoint,
    token_endpoint: j.token_endpoint,
  };
  return _discoveryCache;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return J(401, { error: "unauthorized" });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: claims } = await sb.auth.getClaims(auth.replace("Bearer ", ""));
  const userId = claims?.claims?.sub;
  if (!userId) return J(401, { error: "unauthorized" });

  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some((r: any) => ["owner", "admin", "cfo"].includes(r.role));
  if (!ok) return J(403, { error: "forbidden" });

  const clientId = Deno.env.get("QBO_CLIENT_ID");
  if (!clientId) return J(500, { error: "QBO_CLIENT_ID not configured" });

  const state = crypto.randomUUID();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await admin.from("qbo_oauth_states").delete().eq("user_id", userId);
  const { error: stateError } = await admin.from("qbo_oauth_states").insert({
    state,
    user_id: userId,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  if (stateError) {
    console.error("qbo oauth state insert failed", stateError.message);
    return J(500, { error: "Could not start QuickBooks connection. Please try again." });
  }

  const { authorization_endpoint } = await getIntuitEndpoints();
  const url = new URL(authorization_endpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);

  return J(200, { authorize_url: url.toString() });
});