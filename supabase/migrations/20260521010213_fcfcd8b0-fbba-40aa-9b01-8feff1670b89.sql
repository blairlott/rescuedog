CREATE TABLE public.ad_autopilot_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'instacart',
  ran_at timestamptz NOT NULL DEFAULT now(),
  enabled_before boolean NOT NULL,
  enabled_after boolean NOT NULL,
  error_pct numeric,
  error_sample int,
  trailing_roas numeric,
  trailing_spend_cents bigint,
  trailing_sales_cents bigint,
  candidates_considered int,
  eligible int,
  executed int,
  budget_remaining int,
  b2b_mode text,
  b2b_eligible int,
  auto_stopped boolean NOT NULL DEFAULT false,
  auto_stop_reason text,
  notification_sent boolean NOT NULL DEFAULT false,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_autopilot_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_ops can view autopilot evaluations"
  ON public.ad_autopilot_evaluations
  FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "service role can insert evaluations"
  ON public.ad_autopilot_evaluations
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_ad_autopilot_eval_ran_at ON public.ad_autopilot_evaluations(ran_at DESC);
CREATE INDEX idx_ad_autopilot_eval_platform ON public.ad_autopilot_evaluations(platform, ran_at DESC);