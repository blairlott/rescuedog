CREATE TABLE IF NOT EXISTS public.cfo_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','watch','fyi')),
  headline text NOT NULL,
  body text,
  recommended_action text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
  dedupe_hash text NOT NULL,
  metric_snapshot jsonb,
  date_range_days integer,
  generated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT cfo_insights_dedupe_unique UNIQUE (tile_key, dedupe_hash)
);

CREATE INDEX IF NOT EXISTS idx_cfo_insights_status_generated
  ON public.cfo_insights (status, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cfo_insights_tile_key
  ON public.cfo_insights (tile_key);

ALTER TABLE public.cfo_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance viewers can read insights"
  ON public.cfo_insights FOR SELECT
  TO authenticated
  USING (public.can_view_finance(auth.uid()));

CREATE POLICY "Finance viewers can update insight status"
  ON public.cfo_insights FOR UPDATE
  TO authenticated
  USING (public.can_view_finance(auth.uid()))
  WITH CHECK (public.can_view_finance(auth.uid()));

CREATE POLICY "Admins can delete insights"
  ON public.cfo_insights FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));