// Shared Google Ads OAuth + config loader used by google-ads-proxy and google-ads-oci-upload.
// Refresh-token flow only — no user OAuth.

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
  const customerId = (overrides?.customer_id || Deno.env.get('GOOGLE_ADS_CUSTOMER_ID') || '').replace(/-/g, '');
  const loginCustomerId = (overrides?.login_customer_id || Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID') || '').replace(/-/g, '');
  const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN');
  const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');

  if (!customerId || !clientId || !clientSecret || !refreshToken || !developerToken) {
    return { error: 'server misconfigured: missing Google Ads credentials' };
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
      hint: 'GOOGLE_ADS_REFRESH_TOKEN is likely invalid (invalid_grant). Re-run OAuth and update the secret.',
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
