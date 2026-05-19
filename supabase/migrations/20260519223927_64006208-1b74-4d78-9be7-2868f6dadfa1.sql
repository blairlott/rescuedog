CREATE TABLE IF NOT EXISTS public.kennel_soft_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  signal_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('chain_placement','budget_change','event','inventory','promotion','distributor','creative','competitor','seasonality','general')),
  channel TEXT CHECK (channel IS NULL OR channel IN ('dtc','brick_mortar','instacart','meta','google','wholesale','all')),
  region TEXT,
  sku TEXT,
  effective_date DATE,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.kennel_soft_signals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_kennel_soft_signals_active
  ON public.kennel_soft_signals (status, effective_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kennel_soft_signals_category_channel
  ON public.kennel_soft_signals (category, channel, created_at DESC);

DROP TRIGGER IF EXISTS trg_kennel_soft_signals_updated_at ON public.kennel_soft_signals;
CREATE TRIGGER trg_kennel_soft_signals_updated_at
  BEFORE UPDATE ON public.kennel_soft_signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "kennel can read soft signals" ON public.kennel_soft_signals;
CREATE POLICY "kennel can read soft signals"
  ON public.kennel_soft_signals FOR SELECT
  USING (public.can_view_kennel(auth.uid()));

DROP POLICY IF EXISTS "kennel operators can create soft signals" ON public.kennel_soft_signals;
CREATE POLICY "kennel operators can create soft signals"
  ON public.kennel_soft_signals FOR INSERT
  WITH CHECK (public.is_ad_ops(auth.uid()) OR public.is_executive(auth.uid()));

DROP POLICY IF EXISTS "kennel operators can update soft signals" ON public.kennel_soft_signals;
CREATE POLICY "kennel operators can update soft signals"
  ON public.kennel_soft_signals FOR UPDATE
  USING (public.is_ad_ops(auth.uid()) OR public.is_executive(auth.uid()))
  WITH CHECK (public.is_ad_ops(auth.uid()) OR public.is_executive(auth.uid()));

DROP POLICY IF EXISTS "admins can delete soft signals" ON public.kennel_soft_signals;
CREATE POLICY "admins can delete soft signals"
  ON public.kennel_soft_signals FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));