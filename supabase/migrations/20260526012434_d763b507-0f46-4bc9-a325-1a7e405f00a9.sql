create or replace function public.setup_google_ads_cron(_secret text)
returns text
language plpgsql
security definer
set search_path = public, cron, net
as $$
declare
  _base text := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/';
  _headers text;
begin
  if auth.role() <> 'service_role' and not public.is_admin_or_owner(auth.uid()) then
    raise exception 'permission denied';
  end if;
  if _secret is null or length(_secret) < 8 then
    raise exception 'invalid secret';
  end if;

  _headers := format('{"Content-Type":"application/json","x-cron-secret":%s}', to_json(_secret)::text);

  begin perform cron.unschedule('google_ads_sync_daily'); exception when others then null; end;

  perform cron.schedule(
    'google_ads_sync_daily',
    '0 7 * * *',
    format(
      $cmd$select net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) as request_id;$cmd$,
      _base || 'google-ads-sync',
      _headers
    )
  );

  return 'google_ads_sync_daily scheduled at 07:00 UTC';
end;
$$;

revoke all on function public.setup_google_ads_cron(text) from public, anon, authenticated;
grant execute on function public.setup_google_ads_cron(text) to service_role;