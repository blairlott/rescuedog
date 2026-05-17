-- ============ ad_performance_facts (dimensional) ============
CREATE TABLE IF NOT EXISTS public.ad_performance_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.ad_channels(id) ON DELETE CASCADE,
  platform text NOT NULL,
  date date NOT NULL,
  hour smallint,
  campaign_id text,
  campaign_name text,
  ad_group_id text,
  ad_group_name text,
  ad_id text,
  ad_name text,
  creative_id text,
  creative_name text,
  audience_id text,
  audience_name text,
  placement text,
  network text,
  geo_country text,
  geo_region text,
  geo_dma text,
  geo_zip text,
  device text,
  attribution_window text,
  spend numeric(14,2) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  view_through_conversions integer NOT NULL DEFAULT 0,
  revenue numeric(14,2) NOT NULL DEFAULT 0,
  dim_hash text GENERATED ALWAYS AS (
    md5(coalesce(campaign_id,'') || '|' || coalesce(ad_group_id,'') || '|' ||
        coalesce(ad_id,'') || '|' || coalesce(creative_id,'') || '|' ||
        coalesce(audience_id,'') || '|' || coalesce(placement,'') || '|' ||
        coalesce(network,'') || '|' || coalesce(geo_country,'') || '|' ||
        coalesce(geo_region,'') || '|' || coalesce(geo_dma,'') || '|' ||
        coalesce(geo_zip,'') || '|' || coalesce(device,'') || '|' ||
        coalesce(attribution_window,'') || '|' || coalesce(hour::text,''))
  ) STORED,
  source text NOT NULL DEFAULT 'api',
  ingest_request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ad_perf_facts_unique
  ON public.ad_performance_facts (channel_id, date, dim_hash);
CREATE INDEX IF NOT EXISTS ad_perf_facts_platform_date_idx
  ON public.ad_performance_facts (platform, date DESC);
CREATE INDEX IF NOT EXISTS ad_perf_facts_campaign_idx
  ON public.ad_performance_facts (channel_id, campaign_id, date DESC);
CREATE INDEX IF NOT EXISTS ad_perf_facts_ad_idx
  ON public.ad_performance_facts (channel_id, ad_id, date DESC) WHERE ad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ad_perf_facts_audience_idx
  ON public.ad_performance_facts (channel_id, audience_id, date DESC) WHERE audience_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ad_perf_facts_geo_idx
  ON public.ad_performance_facts (channel_id, geo_region, geo_dma, date DESC);

ALTER TABLE public.ad_performance_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facts_read" ON public.ad_performance_facts FOR SELECT
  USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "facts_write" ON public.ad_performance_facts FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE TRIGGER ad_perf_facts_updated_at BEFORE UPDATE ON public.ad_performance_facts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ad_forecasts ============
CREATE TABLE IF NOT EXISTS public.ad_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.ad_channels(id) ON DELETE CASCADE,
  platform text NOT NULL,
  scope_type text NOT NULL,           -- 'channel' | 'campaign' | 'ad_group' | 'ad' | 'audience' | 'blended'
  scope_id text,
  scope_label text,
  metric text NOT NULL,               -- 'spend' | 'revenue' | 'roas' | 'conversions' | 'pace_to_goal'
  horizon_days integer NOT NULL,
  forecast_value numeric(14,2) NOT NULL,
  lower_bound numeric(14,2),
  upper_bound numeric(14,2),
  confidence numeric(4,3),
  model text NOT NULL DEFAULT 'holt_winters_sql',
  series jsonb,                       -- per-day breakdown for charting
  narrative text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz
);
CREATE INDEX IF NOT EXISTS ad_forecasts_lookup_idx
  ON public.ad_forecasts (platform, scope_type, scope_id, metric, generated_at DESC);
ALTER TABLE public.ad_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forecasts_read" ON public.ad_forecasts FOR SELECT
  USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "forecasts_write" ON public.ad_forecasts FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

-- ============ ad_saturation_curves ============
CREATE TABLE IF NOT EXISTS public.ad_saturation_curves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.ad_channels(id) ON DELETE CASCADE,
  platform text NOT NULL,
  scope_type text NOT NULL,
  scope_id text,
  scope_label text,
  current_daily_spend numeric(12,2),
  current_roas numeric(8,3),
  efficient_spend_ceiling numeric(12,2),  -- where marginal ROAS drops below target
  target_roas numeric(8,3),
  curve_points jsonb NOT NULL,            -- [{spend, predicted_revenue, marginal_roas}, ...]
  recommendation text,
  reallocation_delta numeric(12,2),       -- $ to shift to/from this scope
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_sat_lookup_idx
  ON public.ad_saturation_curves (platform, scope_type, scope_id, generated_at DESC);
ALTER TABLE public.ad_saturation_curves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sat_read" ON public.ad_saturation_curves FOR SELECT
  USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "sat_write" ON public.ad_saturation_curves FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

-- ============ ad_anomalies ============
CREATE TABLE IF NOT EXISTS public.ad_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.ad_channels(id) ON DELETE CASCADE,
  platform text NOT NULL,
  scope_type text NOT NULL,
  scope_id text,
  scope_label text,
  metric text NOT NULL,                   -- spend|cpm|ctr|cvr|roas|revenue
  observed numeric(14,4) NOT NULL,
  expected numeric(14,4) NOT NULL,
  std_dev numeric(14,4),
  z_score numeric(8,3),
  pct_change numeric(8,3),
  severity text NOT NULL,                 -- info|warn|critical
  kind text NOT NULL,                     -- spike|drop|fatigue|pacing
  narrative text,
  suggested_action text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS ad_anomalies_recent_idx
  ON public.ad_anomalies (platform, detected_at DESC) WHERE resolved_at IS NULL;
ALTER TABLE public.ad_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anom_read" ON public.ad_anomalies FOR SELECT
  USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "anom_write" ON public.ad_anomalies FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

-- ============ audience_propensity_scores ============
CREATE TABLE IF NOT EXISTS public.audience_propensity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  visitor_id text,
  score_type text NOT NULL,               -- convert|repeat|churn|ltv
  score numeric(8,4) NOT NULL,
  percentile smallint,
  features jsonb,
  model_version text NOT NULL DEFAULT 'sql_v1',
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS prop_user_idx
  ON public.audience_propensity_scores (user_id, score_type, computed_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS prop_visitor_idx
  ON public.audience_propensity_scores (visitor_id, score_type, computed_at DESC) WHERE visitor_id IS NOT NULL;
ALTER TABLE public.audience_propensity_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prop_read" ON public.audience_propensity_scores FOR SELECT
  USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "prop_write" ON public.audience_propensity_scores FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));