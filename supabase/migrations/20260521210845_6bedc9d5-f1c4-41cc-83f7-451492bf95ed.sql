create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare _jobid bigint;
begin
  select jobid into _jobid from cron.job where jobname = 'auto-curate-media-6h';
  if _jobid is not null then
    perform cron.unschedule(_jobid);
  end if;
end$$;

select cron.schedule(
  'auto-curate-media-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/auto-curate-media',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('limit', 5, 'scene', true)
  );
  $$
);