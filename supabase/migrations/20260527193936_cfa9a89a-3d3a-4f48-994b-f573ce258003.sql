
-- ads_accounts: hide refresh_token from clients
REVOKE SELECT (refresh_token) ON public.ads_accounts FROM anon, authenticated;

-- dropship_partners: hide secrets from clients
REVOKE SELECT (webhook_secret, vendor_credentials, api_key_secret_name) ON public.dropship_partners FROM anon, authenticated;

-- finance_qb_connection: hide tokens from clients
REVOKE SELECT (access_token, refresh_token) ON public.finance_qb_connection FROM anon, authenticated;

-- qbo_connections: hide tokens from clients
REVOKE SELECT (access_token, refresh_token) ON public.qbo_connections FROM anon, authenticated;

-- integration_credentials: hide credential_value (and key name) from clients
REVOKE SELECT (credential_value, credential_key) ON public.integration_credentials FROM anon, authenticated;

-- audit_log: restrict INSERT to admins/owners only (prevents users forging their own entries)
DROP POLICY IF EXISTS "users insert own audit entries" ON public.audit_log;
CREATE POLICY "admins insert audit entries"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_owner(auth.uid()));
