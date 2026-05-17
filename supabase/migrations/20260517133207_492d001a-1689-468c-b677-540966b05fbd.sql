
-- Schedule merch handoff reminder every 10 minutes.
SELECT cron.schedule(
  'merch-handoff-reminder',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/merch-handoff-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
