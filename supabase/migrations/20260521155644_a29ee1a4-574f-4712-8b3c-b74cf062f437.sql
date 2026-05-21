ALTER TABLE public.ig_boost_config 
  ADD COLUMN IF NOT EXISTS daily_total_cap_cents integer NOT NULL DEFAULT 2500,
  ADD COLUMN IF NOT EXISTS kill_link_clicks_spend_cents integer NOT NULL DEFAULT 1500;