
-- Friendly names for ad entities (campaigns / ad groups / products / keywords)
CREATE TABLE IF NOT EXISTS public.kennel_entity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  friendly_name text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_kennel_aliases_lookup
  ON public.kennel_entity_aliases (platform, entity_type, entity_id);

ALTER TABLE public.kennel_entity_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad ops can read aliases"
  ON public.kennel_entity_aliases FOR SELECT
  USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "ad ops can insert aliases"
  ON public.kennel_entity_aliases FOR INSERT
  WITH CHECK (public.is_ad_ops(auth.uid()));
CREATE POLICY "ad ops can update aliases"
  ON public.kennel_entity_aliases FOR UPDATE
  USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "ad ops can delete aliases"
  ON public.kennel_entity_aliases FOR DELETE
  USING (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_kennel_aliases_updated_at
  BEFORE UPDATE ON public.kennel_entity_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend keyword settings into a general "engine settings" row per platform
ALTER TABLE public.kennel_keyword_settings
  ADD COLUMN IF NOT EXISTS budget_pacing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bid_optimization_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_pause_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_roas numeric(6,2) NOT NULL DEFAULT 3.00,
  ADD COLUMN IF NOT EXISTS bid_raise_step_pct integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS bid_lower_step_pct integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS bid_lower_gate_pct integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_daily_bid_changes integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS max_daily_budget_shift_pct integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS budget_floor_cents integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS budget_ceiling_cents integer NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS lookback_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS min_clicks_for_bid_change integer NOT NULL DEFAULT 25;
