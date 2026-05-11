
CREATE TABLE public.impact_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type text NOT NULL,
  target text,
  ambassador_profile_id uuid REFERENCES public.ambassador_profiles(id) ON DELETE CASCADE,
  status text NOT NULL,
  http_status integer,
  latency_ms integer,
  message text,
  details jsonb DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_impact_health_checks_recent ON public.impact_health_checks(checked_at DESC);
CREATE INDEX idx_impact_health_checks_ambassador ON public.impact_health_checks(ambassador_profile_id, checked_at DESC);
CREATE INDEX idx_impact_health_checks_type ON public.impact_health_checks(check_type, checked_at DESC);

ALTER TABLE public.impact_health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage health checks"
  ON public.impact_health_checks FOR ALL
  TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

CREATE POLICY "Ambassadors view own link checks"
  ON public.impact_health_checks FOR SELECT
  TO authenticated
  USING (
    ambassador_profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.ambassador_profiles ap
      WHERE ap.id = impact_health_checks.ambassador_profile_id
        AND ap.user_id = auth.uid()
    )
  );
