import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Public proxy: Lindy POSTs a GAQL query with a shared bearer token.
// We handle the OAuth refresh dance on our side so the refresh token never leaves Lovable Cloud.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Authn: shared bearer
    const auth = req.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const expected = Deno.env.get('LINDY_PROXY_TOKEN');
    if (!expected || token !== expected) {
      return json({ error: 'unauthorized' }, 401);
    }

    if (req.method !== 'POST') {
      return json({ error: 'method not allowed' }, 405);
    }

    // 2. Parse input
    let body: { query?: string; customer_id?: string; login_customer_id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid json body' }, 400);
    }
    const query = (body.query || '').trim();
    if (!query) {
      return json({ error: 'missing "query" (GAQL string)' }, 400);
    }

    const customerId = (body.customer_id || Deno.env.get('GOOGLE_ADS_CUSTOMER_ID') || '').replace(/-/g, '');
    const loginCustomerId = (body.login_customer_id || Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID') || '').replace(/-/g, '');
    const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN');
    const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');

    if (!customerId || !clientId || !clientSecret || !refreshToken || !developerToken) {
      return json({ error: 'server misconfigured: missing Google Ads credentials' }, 500);
    }

    // 3. Exchange refresh token for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      return json({
        error: 'google_oauth_failed',
        status: tokenRes.status,
        details: tokenJson,
        hint: 'GOOGLE_ADS_REFRESH_TOKEN is likely invalid (invalid_grant). Re-run OAuth and update the secret.',
      }, 502);
    }
    const accessToken = tokenJson.access_token as string;

    // 4. Call Google Ads API (searchStream returns the full result set in one shot)
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

    const adsRes = await fetch(
      `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      },
    );
    const adsText = await adsRes.text();
    let adsJson: unknown;
    try { adsJson = JSON.parse(adsText); } catch { adsJson = adsText; }

    if (!adsRes.ok) {
      return json({ error: 'google_ads_api_error', status: adsRes.status, details: adsJson }, 502);
    }

    return json({ ok: true, customer_id: customerId, results: adsJson });
  } catch (e) {
    return json({ error: 'internal_error', message: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}