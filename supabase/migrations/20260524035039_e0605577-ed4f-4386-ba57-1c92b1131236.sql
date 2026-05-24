CREATE TABLE public.kennel_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','error')),
  triggered_by text NOT NULL DEFAULT 'unknown' CHECK (triggered_by IN ('cron','manual','api','unknown')),
  triggered_by_user uuid,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kennel_job_runs_job_started ON public.kennel_job_runs (job_name, started_at DESC);

ALTER TABLE public.kennel_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kennel viewers can read job runs"
  ON public.kennel_job_runs
  FOR SELECT
  TO authenticated
  USING (public.can_view_kennel(auth.uid()));

-- Service role bypasses RLS for inserts/updates; no policy needed for that.