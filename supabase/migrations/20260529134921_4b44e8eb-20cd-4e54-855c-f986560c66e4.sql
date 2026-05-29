
CREATE OR REPLACE FUNCTION public._test_list_vault_names()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE v text;
BEGIN
  SELECT string_agg(name, ', ') INTO v FROM vault.decrypted_secrets;
  RETURN v;
END $$;
