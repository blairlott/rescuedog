// Handles the OAuth redirect from Intuit, exchanges code for tokens, persists connection.
import { createClient } from "npm:@supabase/supabase-js@2";

const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/qbo-auth-callback`;

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>QuickBooks</title>
    <style>body{font-family:-apple-system,sans-serif;max-width:480px;margin:80px auto;padding:24px;text-align:center}
    h1{color:#0d0d0d}p{color:#555}.ok{color:#2d8a3e}.err{color:#c30017}</style></head>
    <body>${body}<p><a href="/finance">Return to Finance Dashboard</a></p></body></html>`,
    { status, headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const errorParam = url.searchParams.get("error");

  if (errorParam) return html(`<h1 class="err">Connection cancelled</h1><p>${errorParam}</p>`, 400);
  if (!code || !state || !realmId) return html(`<h1 class="err">Missing parameters</h1>`, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Validate CSRF state
  await admin.from("qbo_oauth_states").delete().lt("expires_at", new Date().toISOString());
  const { data: st, error: stateLookupError } = await admin
    .from("qbo_oauth_states")
    .select("user_id, expires_at")
    .eq("state", state)
    .maybeSingle();
  if (stateLookupError) {
    console.error("qbo oauth state lookup failed", stateLookupError.message);
    return html(`<h1 class="err">Connection check failed</h1><p>Please start again from the Finance Dashboard.</p>`, 500);
  }
  if (!st) {
    console.warn("qbo oauth invalid state", state);
    return html(`<h1 class="err">Invalid state</h1><p>Please start again from the Finance Dashboard.</p>`, 400);
  }
  if (new Date(st.expires_at) < new Date()) return html(`<h1 class="err">State expired — please try again</h1>`, 400);
  await admin.from("qbo_oauth_states").delete().eq("state", state);

  const clientId = Deno.env.get("QBO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET")!;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    console.error("qbo token exchange failed", tokenRes.status, t);
    return html(`<h1 class="err">Token exchange failed</h1><p>${t.slice(0, 300)}</p>`, 500);
  }
  const tok: any = await tokenRes.json();

  const accessExpires = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();
  const refreshExpires = new Date(Date.now() + (tok.x_refresh_token_expires_in ?? 8640000) * 1000).toISOString();

  // Look up company name (optional)
  let companyName: string | null = null;
  try {
    const ci = await fetch(`https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`, {
      headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" },
    });
    if (ci.ok) {
      const j: any = await ci.json();
      companyName = j?.CompanyInfo?.CompanyName ?? null;
    }
  } catch (_) { /* ignore */ }

  await admin.from("qbo_connections").upsert({
    realm_id: realmId,
    company_name: companyName,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    access_token_expires_at: accessExpires,
    refresh_token_expires_at: refreshExpires,
    environment: "production",
    connected_by: st.user_id,
    connected_at: new Date().toISOString(),
    last_refreshed_at: new Date().toISOString(),
    last_error: null,
  }, { onConflict: "realm_id" });

  return html(`<h1 class="ok">QuickBooks connected ✓</h1><p>Company: <strong>${companyName ?? realmId}</strong></p>`);
});