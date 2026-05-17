
CREATE TABLE IF NOT EXISTS public.kennel_optimizer_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  rule_type text NOT NULL,                    -- 'budget_pacing' | 'bid_raise' | 'bid_lower' | 'pause_zero_roas'
  entity_type text NOT NULL,                  -- 'campaign' | 'adset' | 'ad'
  entity_id text NOT NULL,
  current_value numeric,
  recommended_value numeric,
  delta_pct numeric,
  metric_window_days integer,
  spend_cents integer,
  revenue_cents integer,
  roas numeric,
  clicks integer,
  conversions integer,
  reasoning text,
  status text NOT NULL DEFAULT 'pending',     -- 'pending' | 'applied' | 'rejected' | 'failed' | 'skipped'
  applied_at timestamptz,
  applied_by uuid,
  apply_response jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_optrec_pending ON public.kennel_optimizer_recommendations (platform, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_optrec_entity ON public.kennel_optimizer_recommendations (platform, entity_type, entity_id);

ALTER TABLE public.kennel_optimizer_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad ops read optimizer recs"
  ON public.kennel_optimizer_recommendations FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "ad ops update optimizer recs"
  ON public.kennel_optimizer_recommendations FOR UPDATE
  USING (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_optrec_updated_at
  BEFORE UPDATE ON public.kennel_optimizer_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
