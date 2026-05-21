CREATE TABLE public.ad_autopilot_kill_switch_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,
  switch_name TEXT NOT NULL,
  status TEXT NOT NULL,
  measured_value NUMERIC,
  threshold NUMERIC,
  window_seconds INTEGER,
  sample_size INTEGER,
  failures INTEGER,
  computed_roas NUMERIC,
  spend_cents BIGINT,
  sales_cents BIGINT,
  would_trip BOOLEAN NOT NULL DEFAULT false,
  tripped BOOLEAN NOT NULL DEFAULT false,
  evaluation_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kse_platform_created ON public.ad_autopilot_kill_switch_evaluations (platform, created_at DESC);
CREATE INDEX idx_kse_switch_status ON public.ad_autopilot_kill_switch_evaluations (switch_name, status);

ALTER TABLE public.ad_autopilot_kill_switch_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ad ops can view kill-switch evaluations"
ON public.ad_autopilot_kill_switch_evaluations
FOR SELECT
TO authenticated
USING (public.is_ad_ops(auth.uid()));