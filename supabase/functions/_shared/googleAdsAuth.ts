// Shared Google Ads OAuth + config loader used by google-ads-proxy and google-ads-oci-upload.
// Refresh-token flow. Prefers the live refresh_token stored in the `ads_accounts`
// table (written by the google-ads-oauth callback). Falls back to the
// GOOGLE_ADS_REFRESH_TOKEN env var if the table is empty / unreachable.
import { createClient } from "npm:@supabase/supabase-js@2";

export interface GoogleAdsConfig {
  customerId: string;
  loginCustomerId: string;
  developerToken: string;
}

export interface GoogleAdsAuthResult {
  accessToken: string;
  config: GoogleAdsConfig;
}

export interface GoogleAdsAuthError {
  error: string;
  status?: number;
  details?: unknown;
  hint?: string;
}

/**
 * Load Google Ads config + exchange the refresh token for an access token.
 * Returns either { accessToken, config } on success or { error, ... } on failure.
 */
export async function getGoogleAdsAccessToken(overrides?: {
  customer_id?: string;
  login_customer_id?: string;
}): Promise<GoogleAdsAuthResult | GoogleAdsAuthError> {
  const clientId = (Deno.env.get('GOOGLE_ADS_CLIENT_ID') ?? '').trim();
  const clientSecret = (Deno.env.get('GOOGLE_ADS_CLIENT_SECRET') ?? '').trim();
  const developerToken = (Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '').trim();

  // Try the DB-backed refresh token first (written by /google-ads-oauth/callback).
  let dbCustomerId = '';
  let dbLoginCustomerId = '';
  let dbRefreshToken = '';
  try {
    const sbUrl = Deno.env.get('SUPABASE_URL');
    const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (sbUrl && sbKey) {
      const sb = createClient(sbUrl, sbKey);
      const { data } = await sb
        .from('ads_accounts')
        .select('customer_id, login_customer_id, refresh_token')
        .eq('platform', 'google_ads')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.refresh_token) {
        dbRefreshToken = String(data.refresh_token);
        dbCustomerId = String(data.customer_id ?? '');
        dbLoginCustomerId = String(data.login_customer_id ?? '');
      }
    }
  } catch (_e) {
    // table missing / RLS — fall through to env
  }

  const customerId = (overrides?.customer_id || dbCustomerId || Deno.env.get('GOOGLE_ADS_CUSTOMER_ID') || '').replace(/-/g, '');
  const loginCustomerId = (overrides?.login_customer_id || dbLoginCustomerId || Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID') || '').replace(/-/g, '');
  const refreshToken = dbRefreshToken || Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN') || '';

  if (!customerId || !clientId || !clientSecret || !refreshToken || !developerToken) {
    const missing = [
      !clientId && 'GOOGLE_ADS_CLIENT_ID',
      !clientSecret && 'GOOGLE_ADS_CLIENT_SECRET',
      !developerToken && 'GOOGLE_ADS_DEVELOPER_TOKEN',
      !refreshToken && 'refresh_token (ads_accounts or GOOGLE_ADS_REFRESH_TOKEN)',
      !customerId && 'customer_id (ads_accounts or GOOGLE_ADS_CUSTOMER_ID)',
    ].filter(Boolean).join(', ');
    return {
      error: 'server_misconfigured',
      hint: `Missing: ${missing}. ${!refreshToken || !customerId ? 'Click Reconnect Google Ads to run OAuth.' : ''}`.trim(),
    };
  }

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
    return {
      error: 'google_oauth_failed',
      status: tokenRes.status,
      details: tokenJson,
      hint: dbRefreshToken
        ? 'Stored refresh_token in ads_accounts is invalid (invalid_grant). Re-run OAuth via /kennel/capi → Reconnect Google Ads.'
        : 'GOOGLE_ADS_REFRESH_TOKEN env var is invalid (invalid_grant). Re-run OAuth via /kennel/capi → Reconnect Google Ads to store a fresh token in ads_accounts.',
    };
  }

  return {
    accessToken: tokenJson.access_token as string,
    config: { customerId, loginCustomerId, developerToken },
  };
}

export function buildGoogleAdsHeaders(accessToken: string, cfg: GoogleAdsConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': cfg.developerToken,
    'Content-Type': 'application/json',
  };
  if (cfg.loginCustomerId) headers['login-customer-id'] = cfg.loginCustomerId;
  return headers;
}

export function isAuthError(x: GoogleAdsAuthResult | GoogleAdsAuthError): x is GoogleAdsAuthError {
  return (x as GoogleAdsAuthError).error !== undefined;
}
