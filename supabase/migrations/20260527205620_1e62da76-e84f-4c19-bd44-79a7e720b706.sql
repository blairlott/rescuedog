-- Lock down OAuth tokens, webhook secrets, vendor credentials, and integration credential values.
-- These columns must only be readable by service_role (edge functions). Client-side admin
-- pages have been updated to stop selecting them.

REVOKE SELECT (refresh_token) ON public.ads_accounts FROM anon, authenticated;
REVOKE SELECT (webhook_secret, vendor_credentials) ON public.dropship_partners FROM anon, authenticated;
REVOKE SELECT (refresh_token, access_token) ON public.finance_qb_connection FROM anon, authenticated;
REVOKE SELECT (credential_value) ON public.integration_credentials FROM anon, authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.qbo_connections FROM anon, authenticated;