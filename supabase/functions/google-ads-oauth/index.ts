import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_ADS_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!;
const LOGIN_CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? null;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-ads-oauth/callback`;
const SCOPES = "https://www.googleapis.com/auth/adwords";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdOps(req: Request): Promise<{ userId: string } | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const user = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user: u } } = await user.auth.getUser();
  if (!u) return json({ error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roles } = await admin.from("user_roles").select("role")
    .eq("user_id", u.id)
    .in("role", ["owner", "admin", "ad_ops_manager", "kennel_viewer"])
    .limit(1);
  if (!roles || roles.length === 0) return json({ error: "forbidden" }, 403);
  return { userId: u.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    if (action === "start") {
      const auth = await requireAdOps(req);
      if (auth instanceof Response) return auth;
      const state = crypto.randomUUID();
      await admin.from("ads_oauth_state").insert({ state, created_by: auth.userId });
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) return json({ error: "missing code/state" }, 400);

      const { data: stRow } = await admin.from("ads_oauth_state")
        .select("state, expires_at").eq("state", state).maybeSingle();
      if (!stRow) return json({ error: "invalid state" }, 400);
      if (new Date(stRow.expires_at) < new Date()) return json({ error: "state expired" }, 400);
      await admin.from("ads_oauth_state").delete().eq("state", state);

      // Exchange code → tokens
      const tokRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      const tok = await tokRes.json();
      if (!tokRes.ok || !tok.refresh_token) {
        return json({ error: "token_exchange_failed", detail: tok }, 400);
      }

      // Identify the customer the user actually has access to via listAccessibleCustomers.
      const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
      const listRes = await fetch(
        "https://googleads.googleapis.com/v17/customers:listAccessibleCustomers",
        {
          headers: {
            Authorization: `Bearer ${tok.access_token}`,
            "developer-token": devToken,
          },
        },
      );
      const list = await listRes.json();
      const resourceNames: string[] = list.resourceNames || [];
      const customerId = resourceNames[0]?.split("/")[1] || "";

      const { error: upErr } = await admin.from("ads_accounts").upsert({
        platform: "google_ads",
        customer_id: customerId,
        login_customer_id: LOGIN_CUSTOMER_ID,
        label: `Google Ads ${customerId}`,
        refresh_token: tok.refresh_token,
        status: "active",
      }, { onConflict: "platform,customer_id" });
      if (upErr) return json({ error: upErr.message }, 500);

      // Return a tiny HTML so a browser tab can close itself.
      return new Response(
        `<!doctype html><meta charset=utf-8><title>Connected</title>
         <body style="font-family:system-ui;padding:2rem">
           <h1>Google Ads connected</h1>
           <p>Customer <code>${customerId}</code> linked. You can close this tab.</p>
         </body>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return json({ error: "unknown action" }, 404);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});