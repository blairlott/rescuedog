
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.vs_poll_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  orders_seen integer NOT NULL DEFAULT 0,
  orders_new integer NOT NULL DEFAULT 0,
  capi_purchases_sent integer NOT NULL DEFAULT 0,
  capi_subscribes_sent integer NOT NULL DEFAULT 0,
  ltv_value_sent_cents bigint NOT NULL DEFAULT 0,
  error text,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vs_poll_log_started ON public.vs_poll_log (started_at DESC);

ALTER TABLE public.vs_poll_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view poll log"
  ON public.vs_poll_log FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
