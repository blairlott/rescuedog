CREATE OR REPLACE FUNCTION public.sync_kennel_ingest_vault(p_value text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
  v_desc text := 'Shared secret for cron -> instacart-autopilot and other ingest endpoints. Must match Edge Function env var of same name.';
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'KENNEL_INGEST_SECRET';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, 'KENNEL_INGEST_SECRET', v_desc);
    RETURN jsonb_build_object('mode','create');
  ELSE
    PERFORM vault.update_secret(v_id, p_value, 'KENNEL_INGEST_SECRET', v_desc);
    RETURN jsonb_build_object('mode','update','id',v_id);
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.sync_kennel_ingest_vault(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_kennel_ingest_vault(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_kennel_ingest_vault(text) TO service_role;