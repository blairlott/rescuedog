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
    {"name":"vinoshipper-sync-prices-2h","schedule":"15 */2 * * *","fn":"vinoshipper-sync-prices","body":"{\"triggered_by\":\"cron\"}"}
  ]'::jsonb;
  _job jsonb;
  _results jsonb := '[]'::jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF _secret IS NULL OR length(_secret) < 8 THEN
    RAISE EXCEPTION 'invalid secret';
  END IF;

  _headers := format('{"Content-Type":"application/json","x-cron-secret":%s}', to_json(_secret)::text);

  -- Unschedule the old daily name so we don't double-run
  BEGIN PERFORM cron.unschedule('vinoshipper-sync-prices-daily'); EXCEPTION WHEN OTHERS THEN NULL; END;

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