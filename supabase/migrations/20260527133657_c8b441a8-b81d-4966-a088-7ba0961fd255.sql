
CREATE OR REPLACE FUNCTION public.vault_create_secret_by_name(p_name text, p_secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := vault.create_secret(p_secret, p_name, 'managed-by-cron-secret-vault-sync');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_update_secret_by_name(p_name text, p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_secret, p_name, 'managed-by-cron-secret-vault-sync');
  ELSE
    PERFORM vault.update_secret(v_id, p_secret, p_name, 'managed-by-cron-secret-vault-sync');
  END IF;
END;
$$;
