
-- Helpers for managing vault.secrets by name from edge functions (service_role only).
CREATE OR REPLACE FUNCTION public.vault_secret_id_by_name(p_name text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT id FROM vault.secrets WHERE name = p_name LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.vault_create_secret_by_name(p_name text, p_secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := vault.create_secret(p_secret, p_name, NULL);
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
    PERFORM vault.create_secret(p_secret, p_name, NULL);
  ELSE
    PERFORM vault.update_secret(v_id, p_secret, p_name, NULL);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_secret_id_by_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vault_create_secret_by_name(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vault_update_secret_by_name(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_secret_id_by_name(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_create_secret_by_name(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_update_secret_by_name(text, text) TO service_role;
