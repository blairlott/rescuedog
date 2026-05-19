CREATE OR REPLACE FUNCTION public.kennel_cron_status()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_run_started_at timestamptz,
  last_run_finished_at timestamptz,
  last_run_status text,
  last_run_duration_ms numeric,
  last_run_return_message text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron, extensions
AS $$
BEGIN
  IF NOT public.is_ad_ops(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  WITH last_runs AS (
    SELECT DISTINCT ON (jrd.jobid)
      jrd.jobid,
      jrd.start_time,
      jrd.end_time,
      jrd.status,
      jrd.return_message
    FROM cron.job_run_details jrd
    ORDER BY jrd.jobid, jrd.start_time DESC
  )
  SELECT
    j.jobid,
    j.jobname::text,
    j.schedule::text,
    j.active,
    lr.start_time,
    lr.end_time,
    lr.status::text,
    CASE WHEN lr.end_time IS NOT NULL AND lr.start_time IS NOT NULL
         THEN EXTRACT(EPOCH FROM (lr.end_time - lr.start_time)) * 1000
         ELSE NULL END,
    lr.return_message::text
  FROM cron.job j
  LEFT JOIN last_runs lr ON lr.jobid = j.jobid
  WHERE j.jobname ILIKE 'kennel-%'
  ORDER BY j.jobname;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kennel_cron_status() TO authenticated;