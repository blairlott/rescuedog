ALTER TABLE public.ad_guardrails
  ADD COLUMN IF NOT EXISTS auto_execute_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_execute_min_confidence numeric NOT NULL DEFAULT 0.9,
  ADD COLUMN IF NOT EXISTS auto_execute_max_budget_change_pct numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS auto_execute_max_impact_cents integer NOT NULL DEFAULT 50000;