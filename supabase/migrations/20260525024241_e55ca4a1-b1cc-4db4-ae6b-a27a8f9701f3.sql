CREATE TABLE IF NOT EXISTS public.cron_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','auth_fail','error')),
  http_status int,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_run_log_fn_time ON public.cron_run_log(function_name, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_run_log_status_time ON public.cron_run_log(status, run_at DESC);

ALTER TABLE public.cron_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read cron log"
  ON public.cron_run_log FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));