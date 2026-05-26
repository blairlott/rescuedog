
-- Categories of optimization the system can propose
CREATE TYPE public.optimization_category AS ENUM ('hero_copy','hero_image','cart_upsell','pricing','bundle','merch_copy','other');
CREATE TYPE public.optimization_status AS ENUM ('pending','approved','rejected','applied','superseded');
CREATE TYPE public.optimization_goal AS ENUM ('conversion','aov','both');

CREATE TABLE public.optimization_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.optimization_category NOT NULL,
  goal public.optimization_goal NOT NULL DEFAULT 'conversion',
  surface text,                          -- 'wine' | 'merch' | route | null
  title text NOT NULL,
  rationale text NOT NULL,
  proposed_change jsonb NOT NULL DEFAULT '{}'::jsonb,
  supporting_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) DEFAULT 0.5,   -- 0..1
  est_lift_pct numeric(6,2),             -- estimated % lift
  status public.optimization_status NOT NULL DEFAULT 'pending',
  auto_applied boolean NOT NULL DEFAULT false,
  applied_ref text,                      -- e.g. hero_variants.id once applied
  source text NOT NULL DEFAULT 'optimization-scanner',
  decided_by uuid,
  decided_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_opt_status ON public.optimization_opportunities(status, created_at DESC);
CREATE INDEX idx_opt_category ON public.optimization_opportunities(category, status);

ALTER TABLE public.optimization_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners/admins read opportunities"
  ON public.optimization_opportunities FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "owners/admins update opportunities"
  ON public.optimization_opportunities FOR UPDATE
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Inserts done by service role (edge functions) — no public/auth INSERT policy.

CREATE TRIGGER trg_opt_updated_at
  BEFORE UPDATE ON public.optimization_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-category autonomy settings (1 row per category)
CREATE TABLE public.optimization_settings (
  category public.optimization_category PRIMARY KEY,
  autonomous boolean NOT NULL DEFAULT false,
  min_confidence numeric(4,3) NOT NULL DEFAULT 0.7,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.optimization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners/admins read autonomy"
  ON public.optimization_settings FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "owners/admins write autonomy"
  ON public.optimization_settings FOR ALL
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Seed all categories as manual-review by default.
INSERT INTO public.optimization_settings (category, autonomous, min_confidence) VALUES
  ('hero_copy', false, 0.70),
  ('hero_image', false, 0.75),
  ('cart_upsell', false, 0.70),
  ('pricing', false, 0.85),
  ('bundle', false, 0.70),
  ('merch_copy', false, 0.70),
  ('other', false, 0.80);

-- Approve / reject helper
CREATE OR REPLACE FUNCTION public.apply_opportunity_decision(
  _id uuid,
  _decision text  -- 'approve' | 'reject'
) RETURNS public.optimization_opportunities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.optimization_opportunities;
BEGIN
  IF NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'invalid decision';
  END IF;

  UPDATE public.optimization_opportunities
     SET status = CASE WHEN _decision = 'approve' THEN 'approved'::optimization_status
                       ELSE 'rejected'::optimization_status END,
         decided_by = auth.uid(),
         decided_at = now()
   WHERE id = _id
   RETURNING * INTO _row;

  RETURN _row;
END $$;

CREATE OR REPLACE FUNCTION public.set_autonomous_mode(
  _category public.optimization_category,
  _autonomous boolean,
  _min_confidence numeric DEFAULT NULL
) RETURNS public.optimization_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.optimization_settings;
BEGIN
  IF NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.optimization_settings (category, autonomous, min_confidence, updated_by, updated_at)
  VALUES (_category, _autonomous, COALESCE(_min_confidence, 0.7), auth.uid(), now())
  ON CONFLICT (category) DO UPDATE
    SET autonomous = EXCLUDED.autonomous,
        min_confidence = COALESCE(_min_confidence, public.optimization_settings.min_confidence),
        updated_by = auth.uid(),
        updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END $$;
