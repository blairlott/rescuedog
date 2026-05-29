
CREATE OR REPLACE FUNCTION public._test_decode_srk()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public, extensions
AS $$
DECLARE
  v_srk text;
  v_parts text[];
  v_payload text;
BEGIN
  SELECT decrypted_secret INTO v_srk FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key';
  IF v_srk IS NULL THEN RETURN 'NULL'; END IF;
  v_parts := string_to_array(v_srk, '.');
  IF array_length(v_parts,1) < 2 THEN RETURN 'not_jwt: ' || left(v_srk,40); END IF;
  -- base64url decode middle segment, pad as needed
  v_payload := v_parts[2];
  v_payload := translate(v_payload, '-_', '+/');
  WHILE length(v_payload) % 4 <> 0 LOOP v_payload := v_payload || '='; END LOOP;
  RETURN convert_from(decode(v_payload, 'base64'), 'utf8');
END $$;
