
CREATE OR REPLACE FUNCTION public._test_srk_fingerprint()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v_srk text;
BEGIN
  SELECT decrypted_secret INTO v_srk FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
  IF v_srk IS NULL THEN RETURN 'NULL'; END IF;
  RETURN substring(v_srk,1,12) || '...' || substring(v_srk, length(v_srk)-7) || ' len=' || length(v_srk);
END $$;
