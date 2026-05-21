
CREATE TABLE public.ig_post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id text NOT NULL,
  media_type text,
  permalink text,
  caption text,
  post_timestamp timestamptz,
  impressions int,
  reach int,
  likes int,
  comments int,
  shares int,
  saves int,
  engagement_rate numeric,
  save_rate numeric,
  polled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ig_post_metrics_post_id_idx ON public.ig_post_metrics(post_id, polled_at DESC);

CREATE TABLE public.ig_boost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id text NOT NULL,
  triggered_by text,
  trigger_value numeric,
  test_variant text CHECK (test_variant IN ('conversion','wine_club')),
  ad_id text,
  adset_id text,
  campaign_id text,
  daily_budget_cents int,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','killed','winner')),
  kill_reason text,
  spend_at_kill numeric,
  purchases_at_kill int,
  subscribes_at_kill int,
  spend numeric DEFAULT 0,
  purchases int DEFAULT 0,
  subscribes int DEFAULT 0,
  frequency numeric,
  cost_per_result numeric,
  roas numeric,
  last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ig_boost_log_post_variant_idx ON public.ig_boost_log(post_id, test_variant);
CREATE INDEX ig_boost_log_status_idx ON public.ig_boost_log(status);

CREATE TABLE public.ig_boost_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  save_rate_threshold numeric NOT NULL DEFAULT 0.03,
  engagement_rate_threshold numeric NOT NULL DEFAULT 0.06,
  min_reach int NOT NULL DEFAULT 500,
  min_post_age_hours int NOT NULL DEFAULT 24,
  daily_budget_per_variant_cents int NOT NULL DEFAULT 2500,
  kill_spend_threshold_cents int NOT NULL DEFAULT 3000,
  kill_frequency numeric NOT NULL DEFAULT 3.5,
  max_active_boosts int NOT NULL DEFAULT 3,
  default_objective text NOT NULL DEFAULT 'ab_test',
  ab_winner_roas_threshold numeric NOT NULL DEFAULT 2.5,
  ab_winner_cpl_cents int NOT NULL DEFAULT 2500,
  winner_min_spend_cents int NOT NULL DEFAULT 5000,
  winner_min_age_days int NOT NULL DEFAULT 7,
  static_ltv_cents int NOT NULL DEFAULT 40000,
  ig_user_id text NOT NULL DEFAULT '1689217927783203',
  meta_ad_account_id text NOT NULL DEFAULT 'act_23490172',
  purchase_audience_id text NOT NULL DEFAULT '6937215635059',
  lal_1pct_audience_id text NOT NULL DEFAULT '6937215772659',
  lal_high_ltv_audience_id text NOT NULL DEFAULT '52507005005463',
  excluded_region_keys text[] NOT NULL DEFAULT ARRAY['3847','3856','3843','3845','3848','3863','3851','3852','3855'],
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ig_boost_config DEFAULT VALUES;

CREATE TRIGGER ig_boost_log_updated_at BEFORE UPDATE ON public.ig_boost_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ig_boost_config_updated_at BEFORE UPDATE ON public.ig_boost_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ig_post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_boost_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_boost_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_ops read ig_post_metrics" ON public.ig_post_metrics
  FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "ad_ops write ig_post_metrics" ON public.ig_post_metrics
  FOR ALL USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE POLICY "ad_ops read ig_boost_log" ON public.ig_boost_log
  FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "ad_ops write ig_boost_log" ON public.ig_boost_log
  FOR ALL USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE POLICY "ad_ops read ig_boost_config" ON public.ig_boost_config
  FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "ad_ops write ig_boost_config" ON public.ig_boost_config
  FOR ALL USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));
