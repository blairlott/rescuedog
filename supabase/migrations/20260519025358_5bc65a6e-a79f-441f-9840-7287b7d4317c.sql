
ALTER TABLE public.kennel_bid_modifiers ADD COLUMN IF NOT EXISTS override_modifier numeric;
ALTER TABLE public.kennel_geo_modifiers ADD COLUMN IF NOT EXISTS override_modifier numeric;
ALTER TABLE public.kennel_seasonality_curve ADD COLUMN IF NOT EXISTS override_budget_index numeric;

ALTER TABLE public.kennel_bid_modifiers ADD CONSTRAINT kennel_bid_override_range CHECK (override_modifier IS NULL OR (override_modifier >= 0.1 AND override_modifier <= 5));
ALTER TABLE public.kennel_geo_modifiers ADD CONSTRAINT kennel_geo_override_range CHECK (override_modifier IS NULL OR (override_modifier >= 0.1 AND override_modifier <= 5));
ALTER TABLE public.kennel_seasonality_curve ADD CONSTRAINT kennel_seasonality_override_range CHECK (override_budget_index IS NULL OR (override_budget_index >= 0.1 AND override_budget_index <= 5));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kennel_bid_modifiers' AND policyname='kennel_bid_modifiers_override_update_adops') THEN
    CREATE POLICY kennel_bid_modifiers_override_update_adops ON public.kennel_bid_modifiers
      FOR UPDATE TO authenticated
      USING (public.is_ad_ops(auth.uid()))
      WITH CHECK (public.is_ad_ops(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kennel_geo_modifiers' AND policyname='kennel_geo_modifiers_override_update_adops') THEN
    CREATE POLICY kennel_geo_modifiers_override_update_adops ON public.kennel_geo_modifiers
      FOR UPDATE TO authenticated
      USING (public.is_ad_ops(auth.uid()))
      WITH CHECK (public.is_ad_ops(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kennel_seasonality_curve' AND policyname='kennel_seasonality_curve_override_update_adops') THEN
    CREATE POLICY kennel_seasonality_curve_override_update_adops ON public.kennel_seasonality_curve
      FOR UPDATE TO authenticated
      USING (public.is_ad_ops(auth.uid()))
      WITH CHECK (public.is_ad_ops(auth.uid()));
  END IF;
END $$;
