const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
const TOKEN_URL = "https://api.ads.instacart.com/oauth/token";
const DEFAULT_REDIRECT = "https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/oauth-instacart-callback";

import { createClient } from "npm:@supabase/supabase-js@2";

async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "missing authorization" };
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return { ok: false, status: 401, error: "invalid token" };
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", data.claims.sub);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
  if (!isAdmin) return { ok: false, status: 403, error: "admin required" };
  return { ok: true };
}

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Instacart OAuth</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:48px auto;padding:0 20px;color:#111}
h1{margin:0 0 8px}code,pre{background:#f4f4f4;padding:8px 12px;border-radius:6px;display:block;word-break:break-all;white-space:pre-wrap}
.ok{color:#0a7c2f}.err{color:#c30017}.muted{color:#666;font-size:14px}</style></head><body>${body}</body></html>`,
    { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  // Accept code via query (GET) or JSON body (POST from the rescuedogwines.com catcher).
  let code = url.searchParams.get("code");
  let error = url.searchParams.get("error");
  let redirect_uri = url.searchParams.get("redirect_uri") ?? "https://rescuedogwines.com/";
  let wantsJson = url.searchParams.get("format") === "json";

  if (req.method === "POST") {
    wantsJson = true;
    try {
      const body = await req.json();
      code = body?.code ?? code;
      error = body?.error ?? error;
      redirect_uri = body?.redirect_uri ?? redirect_uri;
    } catch { /* ignore */ }
  }

  // Require an authenticated admin/owner before exchanging the code. This
  // prevents anonymous callers from racing a valid auth code to obtain a
  // long-lived Instacart Ads refresh_token.
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    if (wantsJson) return new Response(JSON.stringify({ ok: false, error: gate.error }), { status: gate.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return html(`<h1 class="err">Not authorized</h1><p class="muted">Sign in as an admin in Lovable Cloud before completing Instacart OAuth.</p>`, gate.status);
  }

  if (error) {
    if (wantsJson) return new Response(JSON.stringify({ ok: false, error }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return html(`<h1 class="err">Instacart returned an error</h1><pre>${error}</pre>`, 400);
  }
  if (!code) {
    if (wantsJson) return new Response(JSON.stringify({ ok: false, error: "missing code" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return html(`<h1 class="err">Missing <code>code</code> query param</h1>
<p class="muted">This endpoint should be hit by Instacart's OAuth redirect.</p>`, 400);
  }

  const client_id = Deno.env.get("INSTACART_ADS_CLIENT_ID");
  const client_secret = Deno.env.get("INSTACART_ADS_CLIENT_SECRET");
  if (!client_id || !client_secret) {
    if (wantsJson) return new Response(JSON.stringify({ ok: false, error: "missing credentials" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return html(`<h1 class="err">Missing client credentials</h1>`, 500);
  }

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id,
      client_secret,
      redirect_uri,
    }),
  });
  const bodyText = await r.text();
  let body: any = {};
  try { body = JSON.parse(bodyText); } catch { /* keep raw */ }

  if (!r.ok || !body?.refresh_token) {
    if (wantsJson) return new Response(JSON.stringify({ ok: false, status: r.status, body: bodyText, redirect_uri }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return html(`<h1 class="err">Token exchange failed (HTTP ${r.status})</h1>
<p class="muted">Most common cause: <code>redirect_uri</code> here doesn't match the one registered in Instacart Ads Manager.</p>
<pre>${bodyText.slice(0, 1000)}</pre>
<p class="muted">redirect_uri used: <code>${redirect_uri}</code></p>`, 400);
  }

  // Persist for later automated refresh attempts (best-effort; secrets store can't be
  // updated from an edge function, so we also display the token for manual save).
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/app_settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          key: "instacart_refresh_token_latest",
          value: JSON.stringify({ refresh_token: body.refresh_token, issued_at: new Date().toISOString() }),
        }),
      });
    }
  } catch { /* non-fatal */ }

  if (wantsJson) {
    return new Response(JSON.stringify({ ok: true, refresh_token: body.refresh_token, expires_in: body.expires_in }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return html(`<h1 class="ok">Instacart connected ✓</h1>
<p>New <code>refresh_token</code>:</p>
<pre>${body.refresh_token}</pre>
<p class="muted">Copy this value and update the <code>INSTACART_ADS_REFRESH_TOKEN</code> secret in Lovable Cloud. The new token has been queued for save.</p>
<details><summary>Full response</summary><pre>${JSON.stringify(body, null, 2)}</pre></details>`);
});