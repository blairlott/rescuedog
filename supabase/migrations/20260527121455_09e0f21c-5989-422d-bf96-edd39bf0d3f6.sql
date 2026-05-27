CREATE OR REPLACE FUNCTION public.setup_gated_cron_jobs(_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'net'
AS $function$
DECLARE
  _base text := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/';
  _headers text;
  _jobs jsonb := '[
    {"name":"weekly-compliance-audit","schedule":"0 9 * * 1","fn":"compliance-audit","body":"{\"triggered_by\":\"cron\"}"},
    {"name":"phase4-ai-creative-variants","schedule":"0 */6 * * *","fn":"ai-creative-variants","body":"{\"triggered_by\":\"cron\"}"},
    {"name":"phase4-seo-autopilot-sweep","schedule":"0 3 * * *","fn":"seo-autopilot-sweep","body":"{\"triggered_by\":\"cron\"}"},
    {"name":"auto-curate-media-6h","schedule":"0 */6 * * *","fn":"auto-curate-media","body":"{\"triggered_by\":\"cron\"}"},
    {"name":"vinoshipper-sync-prices-2h","schedule":"15 */2 * * *","fn":"vinoshipper-sync-prices","body":"{\"triggered_by\":\"cron\"}"},
    {"name":"auto-pause-sweep-6h","schedule":"0 */6 * * *","fn":"auto-pause-sweep","body":"{\"triggered_by\":\"cron\"}"},
    {"name":"abandoned-cart-sweep-1h","schedule":"5 * * * *","fn":"abandoned-cart-sweep","body":"{\"triggered_by\":\"cron\"}"},
    {"name":"anniversary-sweep-daily","schedule":"0 13 * * *","fn":"anniversary-sweep","body":"{\"triggered_by\":\"cron\"}"},
    {"name":"event-reminder-sweep-daily","schedule":"30 13 * * *","fn":"event-reminder-sweep","body":"{\"triggered_by\":\"cron\"}"},
    {"name":"reengagement-sweep-daily","schedule":"0 14 * * *","fn":"reengagement-sweep","body":"{\"triggered_by\":\"cron\"}"},
    {"name":"gclid-oci-loop-daily","schedule":"0 9 * * *","fn":"gclid-oci-loop","body":"{\"lookback_days\":7}"}
  ]'::jsonb;
  _job jsonb;
  _results jsonb := '[]'::jsonb;
  _stale_jobname text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF _secret IS NULL OR length(_secret) < 8 THEN
    RAISE EXCEPTION 'invalid secret';
  END IF;

  _headers := format('{"Content-Type":"application/json","x-cron-secret":%s}', to_json(_secret)::text);

  FOREACH _stale_jobname IN ARRAY ARRAY[
    'vinoshipper-sync-prices-daily',
    'auto-pause-sweep',
    'abandoned-cart-sweep',
    'anniversary-sweep',
    'event-reminder-sweep',
    'reengagement-sweep',
    'gclid-oci-loop-2h'
  ] LOOP
    BEGIN PERFORM cron.unschedule(_stale_jobname); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  FOR _stale_jobname IN
    SELECT jobname FROM cron.job
    WHERE (
      command ILIKE '%/functions/v1/auto-pause-sweep%'
      OR command ILIKE '%/functions/v1/abandoned-cart-sweep%'
      OR command ILIKE '%/functions/v1/anniversary-sweep%'
      OR command ILIKE '%/functions/v1/event-reminder-sweep%'
      OR command ILIKE '%/functions/v1/reengagement-sweep%'
      OR command ILIKE '%/functions/v1/gclid-oci-loop%'
    )
    AND command NOT ILIKE '%x-cron-secret%'
  LOOP
    BEGIN PERFORM cron.unschedule(_stale_jobname); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  FOR _job IN SELECT * FROM jsonb_array_elements(_jobs) LOOP
    BEGIN
      PERFORM cron.unschedule((_job->>'name'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      (_job->>'name'),
      (_job->>'schedule'),
      format(
        $cmd$SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb) AS request_id;$cmd$,
        _base || (_job->>'fn'),
        _headers,
        (_job->>'body')
      )
    );

    _results := _results || jsonb_build_object('name', _job->>'name', 'scheduled', true);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'jobs', _results);
END;
$function$;