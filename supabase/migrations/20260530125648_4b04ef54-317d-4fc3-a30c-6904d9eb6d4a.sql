REVOKE EXECUTE ON FUNCTION public.vault_secret_fingerprint(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vault_secret_fingerprint(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vault_secret_fingerprint(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vault_secret_fingerprint(text) TO service_role;