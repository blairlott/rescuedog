-- Logs each ops digest run
CREATE TABLE IF NOT EXISTS public.ops_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date date NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  html text,
  recipients text[] NOT NULL DEFAULT '{}'::text[],
  email_status text NOT NULL DEFAULT 'pending',
  email_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_digest_runs_date_idx ON public.ops_digest_runs (digest_date DESC);

ALTER TABLE public.ops_digest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_digest_read ON public.ops_digest_runs;
CREATE POLICY ops_digest_read ON public.ops_digest_runs
  FOR SELECT
  USING (public.is_executive(auth.uid()) OR public.is_ad_ops(auth.uid()));

-- Seed default settings if missing
INSERT INTO public.app_settings (key, value)
VALUES
  ('ops_digest_enabled', 'true'::jsonb),
  ('ops_digest_recipients', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Schedule cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule('customer-cohorts-rebuild-nightly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('ops-daily-digest');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'customer-cohorts-rebuild-nightly',
  '15 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/customer-cohorts-rebuild',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'ops-daily-digest',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/ops-daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);