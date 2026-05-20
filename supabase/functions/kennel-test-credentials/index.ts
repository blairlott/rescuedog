// Lightweight credential probe. Called by /kennel/integrations "Test" buttons.
// Auth: requires authenticated admin/owner via JWT.
// Body: { provider: "yahoo_dsp" | "openweather" | "mailchimp" | "delivery_webhooks" }
// Returns: { ok: bool, status: "success" | "missing" | "invalid" | "skipped", detail?: string }
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
import { getCredentials } from "../_shared/credentials.ts";

const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;
  const { data } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("owner") && !roles.includes("admin")) return null;
  return user;
}

async function probeYahoo(creds: Record<string, string | null>) {
  const { client_id, client_secret, advertiser_id } = creds;
  if (!client_id || !client_secret || !advertiser_id) {
    return { ok: false, status: "missing", detail: "client_id / client_secret / advertiser_id not set" };
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "dsp-api-access",
    client_id, client_secret,
  });
  const r = await fetch("https://id.b2b.yahooinc.com/identity/oauth2/access_token?realm=dsp", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) return { ok: false, status: "invalid", detail: `oauth HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const j: any = await r.json();
  return j?.access_token
    ? { ok: true, status: "success", detail: `token received (expires in ${j.expires_in ?? "?"}s)` }
    : { ok: false, status: "invalid", detail: "no access_token in response" };
}

async function probeOpenWeather(creds: Record<string, string | null>) {
  const { api_key } = creds;
  if (!api_key) return { ok: false, status: "missing", detail: "api_key not set" };
  const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Napa,US&appid=${api_key}`);
  if (r.status === 401) return { ok: false, status: "invalid", detail: "API key rejected (401)" };
  if (!r.ok) return { ok: false, status: "invalid", detail: `HTTP ${r.status}` };
  return { ok: true, status: "success", detail: "Napa,US returned 200" };
}

async function probeMailchimp(creds: Record<string, string | null>) {
  const { api_key, server } = creds;
  if (!api_key) return { ok: false, status: "missing", detail: "api_key not set" };
  const dc = server || api_key.split("-")[1];
  if (!dc) return { ok: false, status: "invalid", detail: "could not derive data center from key" };
  const r = await fetch(`https://${dc}.api.mailchimp.com/3.0/ping`, {
    headers: { Authorization: `Basic ${btoa(`anystring:${api_key}`)}` },
  });
  if (!r.ok) return { ok: false, status: "invalid", detail: `HTTP ${r.status}` };
  return { ok: true, status: "success", detail: `ping ok on ${dc}` };
}

function probeDeliveryWebhooks(creds: Record<string, string | null>) {
  const set = Object.entries(creds).filter(([_, v]) => v && v.length > 0).map(([k]) => k);
  if (set.length === 0) return { ok: false, status: "missing", detail: "no signing secrets configured" };
  return { ok: true, status: "success", detail: `${set.length} secret(s) configured: ${set.join(", ")}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return J(405, { error: "method not allowed" });

  const user = await requireAdmin(req);
  if (!user) return J(401, { error: "admin/owner required" });

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const provider = String(body.provider ?? "");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let result: { ok: boolean; status: string; detail?: string };
    switch (provider) {
      case "yahoo_dsp": {
        const creds = await getCredentials(admin, "yahoo_dsp", [
          { key: "client_id",     envFallback: "YAHOO_DSP_CLIENT_ID" },
          { key: "client_secret", envFallback: "YAHOO_DSP_CLIENT_SECRET" },
          { key: "advertiser_id", envFallback: "YAHOO_DSP_ADVERTISER_ID" },
        ]);
        result = await probeYahoo(creds);
        break;
      }
      case "openweather": {
        const creds = await getCredentials(admin, "openweather", [
          { key: "api_key", envFallback: "OPENWEATHER_API_KEY" },
        ]);
        result = await probeOpenWeather(creds);
        break;
      }
      case "mailchimp": {
        const creds = await getCredentials(admin, "mailchimp", [
          { key: "api_key",     envFallback: "MAILCHIMP_API_KEY" },
          { key: "server",      envFallback: "MAILCHIMP_SERVER" },
          { key: "audience_id", envFallback: "MAILCHIMP_AUDIENCE_ID" },
        ]);
        result = await probeMailchimp(creds);
        break;
      }
      case "delivery_webhooks": {
        const creds = await getCredentials(admin, "delivery_webhooks", [
          { key: "doordash_secret",  envFallback: "DELIVERY_DOORDASH_SECRET" },
          { key: "uber_secret",      envFallback: "DELIVERY_UBER_SECRET" },
          { key: "grubhub_secret",   envFallback: "DELIVERY_GRUBHUB_SECRET" },
          { key: "instacart_secret", envFallback: "DELIVERY_INSTACART_SECRET" },
        ]);
        result = probeDeliveryWebhooks(creds);
        break;
      }
      default:
        return J(400, { error: `unknown provider: ${provider}` });
    }
    return J(200, { provider, ...result });
  } catch (e: any) {
    console.error("kennel-test-credentials", e);
    return J(500, { ok: false, status: "error", detail: String(e?.message ?? e) });
  }
});
