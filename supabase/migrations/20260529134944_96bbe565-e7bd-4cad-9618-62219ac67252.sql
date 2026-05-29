
CREATE OR REPLACE FUNCTION public._test_cron_auth(_fn text, _mode text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url text;
  v_headers jsonb;
  v_secret text;
  v_srk text;
  v_req_id bigint;
BEGIN
  v_url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/' || _fn;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET';
  SELECT decrypted_secret INTO v_srk FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key';

  IF _mode = 'cron' THEN
    v_headers := jsonb_build_object('content-type','application/json','x-cron-secret', v_secret);
  ELSIF _mode = 'jwt' THEN
    IF v_srk IS NULL THEN RAISE EXCEPTION 'no SRK in vault'; END IF;
    v_headers := jsonb_build_object('content-type','application/json','authorization','Bearer ' || v_srk);
  ELSE
    RAISE EXCEPTION 'bad mode';
  END IF;

  SELECT net.http_post(url := v_url, headers := v_headers, body := '{}'::jsonb) INTO v_req_id;
  RETURN v_req_id;
END $$;
