import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { getGoogleAdsAccessToken, buildGoogleAdsHeaders, isAuthError } from '../_shared/googleAdsAuth.ts';

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

    // 3. Resolve Google Ads credentials + access token (shared helper)
    const auth = await getGoogleAdsAccessToken({
      customer_id: body.customer_id,
      login_customer_id: body.login_customer_id,
    });
    if (isAuthError(auth)) {
      const status = auth.error === 'google_oauth_failed' ? 502 : 500;
      return json(auth, status);
    }
    const { accessToken, config } = auth;
    const customerId = config.customerId;
    const headers = buildGoogleAdsHeaders(accessToken, config);

    // 4. Call Google Ads API (searchStream returns the full result set in one shot)
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