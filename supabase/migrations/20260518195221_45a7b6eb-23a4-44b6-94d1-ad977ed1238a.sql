
-- ============ PHASE 2A ============

-- Guardrail baseline: today's snapshot per channel/campaign
CREATE TABLE IF NOT EXISTS public.guardrail_baseline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.ad_channels(id) ON DELETE CASCADE,
  platform text NOT NULL,
  campaign_id text,
  baseline_daily_budget_cents integer,
  baseline_mtd_spend_cents integer,
  captured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'auto_daily' CHECK (source IN ('auto_daily','manual','seed')),
  is_current boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS guardrail_baseline_current_idx
  ON public.guardrail_baseline (platform, COALESCE(campaign_id, ''))
  WHERE is_current = true;
CREATE INDEX IF NOT EXISTS guardrail_baseline_captured_idx
  ON public.guardrail_baseline (captured_at DESC);

ALTER TABLE public.guardrail_baseline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guardrail_baseline_select" ON public.guardrail_baseline
  FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "guardrail_baseline_service_write" ON public.guardrail_baseline
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "guardrail_baseline_admin_write" ON public.guardrail_baseline
  FOR ALL USING (public.is_admin_or_owner(auth.uid())) WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Extend ad_guardrails with new Phase 2 fields
ALTER TABLE public.ad_guardrails
  ADD COLUMN IF NOT EXISTS max_24h_cumulative_delta_pct numeric(6,2) NOT NULL DEFAULT 60.00,
  ADD COLUMN IF NOT EXISTS daily_spend_cap_multiplier numeric(5,2) NOT NULL DEFAULT 1.75;

-- Extend ad_execution_log with phase 2 columns
ALTER TABLE public.ad_execution_log
  ADD COLUMN IF NOT EXISTS guardrail_results jsonb,
  ADD COLUMN IF NOT EXISTS executor text,
  ADD COLUMN IF NOT EXISTS before_value jsonb,
  ADD COLUMN IF NOT EXISTS after_value jsonb,
  ADD COLUMN IF NOT EXISTS baseline_id uuid REFERENCES public.guardrail_baseline(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS campaign_id text,
  ADD COLUMN IF NOT EXISTS delta_pct numeric(8,2),
  ADD COLUMN IF NOT EXISTS spend_impact_cents integer;

-- Alert dispatch log
CREATE TABLE IF NOT EXISTS public.alert_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('anomaly','recommendation','auto_executed','rollback','pacing','manual_test')),
  channel text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels_sent text[] NOT NULL DEFAULT ARRAY[]::text[],
  email_message_id text,
  sms_sid text,
  success boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_dispatch_log_created_idx ON public.alert_dispatch_log (created_at DESC);
ALTER TABLE public.alert_dispatch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_dispatch_select" ON public.alert_dispatch_log
  FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "alert_dispatch_service_write" ON public.alert_dispatch_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Seed default global kill switch + thresholds into ad_settings
INSERT INTO public.ad_settings (key, value) VALUES
  ('kill_switch', 'false'::jsonb),
  ('kill_switch_meta', 'false'::jsonb),
  ('kill_switch_google', 'false'::jsonb),
  ('kill_switch_instacart', 'false'::jsonb),
  ('guardrail_thresholds', '{"max_single_delta_pct":25,"max_24h_cumulative_delta_pct":60,"daily_spend_cap_multiplier":1.5,"confidence_floor":0.80}'::jsonb),
  ('alert_recipients', '{"email":["blair.lott@rescuedogwines.com"],"sms":["+14043120550"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============ PHASE 2B ============

CREATE TABLE IF NOT EXISTS public.customer_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text NOT NULL,
  ltv_cents integer NOT NULL DEFAULT 0,
  purchase_count integer NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  churn_risk_score numeric(4,3) NOT NULL DEFAULT 0 CHECK (churn_risk_score BETWEEN 0 AND 1),
  tier text NOT NULL DEFAULT 'new' CHECK (tier IN ('new','repeat','vip','churn_risk','churned')),
  source text NOT NULL DEFAULT 'stub' CHECK (source IN ('mailchimp_wf12','mailchimp_wf13','vinoshipper','stub')),
  state text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_signals_email_idx ON public.customer_signals (lower(email));
CREATE INDEX IF NOT EXISTS customer_signals_tier_idx ON public.customer_signals (tier);
ALTER TABLE public.customer_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_signals_select" ON public.customer_signals FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "customer_signals_service_write" ON public.customer_signals FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');

CREATE TABLE IF NOT EXISTS public.audience_bid_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  audience_key text NOT NULL,
  modifier_pct numeric(6,2) NOT NULL DEFAULT 0,
  rationale text,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS audience_bid_modifiers_unique ON public.audience_bid_modifiers (channel, audience_key);
ALTER TABLE public.audience_bid_modifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audience_bid_select" ON public.audience_bid_modifiers FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "audience_bid_admin_write" ON public.audience_bid_modifiers FOR ALL USING (public.is_admin_or_owner(auth.uid())) WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TABLE IF NOT EXISTS public.frequency_cap_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_key text NOT NULL,
  channel text NOT NULL,
  impressions_7d integer NOT NULL DEFAULT 0,
  last_seen timestamptz,
  capped boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS frequency_cap_unique ON public.frequency_cap_status (visitor_key, channel);
ALTER TABLE public.frequency_cap_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frequency_cap_select" ON public.frequency_cap_status FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "frequency_cap_service_write" ON public.frequency_cap_status FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');

CREATE TABLE IF NOT EXISTS public.attribution_dedup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id text NOT NULL,
  winning_channel text NOT NULL,
  contributing_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule text NOT NULL DEFAULT 'last_click_7d' CHECK (rule IN ('last_click_7d','first_click_7d','linear','incrementality_adjusted')),
  revenue_cents integer,
  dedup_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS attribution_dedup_conv_idx ON public.attribution_dedup_log (conversion_id);
CREATE INDEX IF NOT EXISTS attribution_dedup_channel_idx ON public.attribution_dedup_log (winning_channel, dedup_at DESC);
ALTER TABLE public.attribution_dedup_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attribution_dedup_select" ON public.attribution_dedup_log FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "attribution_dedup_service_write" ON public.attribution_dedup_log FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');

CREATE TABLE IF NOT EXISTS public.incrementality_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  holdout_pct numeric(5,2) NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','completed','aborted')),
  control_conversions integer NOT NULL DEFAULT 0,
  exposed_conversions integer NOT NULL DEFAULT 0,
  lift_pct numeric(6,2),
  p_value numeric(6,4),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.incrementality_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incrementality_select" ON public.incrementality_tests FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "incrementality_admin_write" ON public.incrementality_tests FOR ALL USING (public.is_admin_or_owner(auth.uid())) WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TABLE IF NOT EXISTS public.pacing_forecast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  month date NOT NULL,
  budget_cents integer NOT NULL DEFAULT 0,
  spend_to_date_cents integer NOT NULL DEFAULT 0,
  projected_eom_spend_cents integer NOT NULL DEFAULT 0,
  on_pace boolean NOT NULL DEFAULT true,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pacing_forecast_unique ON public.pacing_forecast (channel, month);
ALTER TABLE public.pacing_forecast ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pacing_select" ON public.pacing_forecast FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "pacing_service_write" ON public.pacing_forecast FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');

CREATE TABLE IF NOT EXISTS public.creative_fatigue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id text NOT NULL,
  channel text NOT NULL,
  impressions_7d integer NOT NULL DEFAULT 0,
  ctr_7d numeric(6,4) NOT NULL DEFAULT 0,
  ctr_30d_baseline numeric(6,4) NOT NULL DEFAULT 0,
  fatigue_score numeric(4,3) NOT NULL DEFAULT 0 CHECK (fatigue_score BETWEEN 0 AND 1),
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS creative_fatigue_unique ON public.creative_fatigue (channel, creative_id);
ALTER TABLE public.creative_fatigue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creative_fatigue_select" ON public.creative_fatigue FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "creative_fatigue_service_write" ON public.creative_fatigue FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');

CREATE TABLE IF NOT EXISTS public.dayparting_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  campaign_id text,
  hour_of_day integer NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  recommended_bid_modifier_pct numeric(6,2) NOT NULL DEFAULT 0,
  basis_conversions integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dayparting_channel_idx ON public.dayparting_recommendations (channel, day_of_week, hour_of_day);
ALTER TABLE public.dayparting_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dayparting_select" ON public.dayparting_recommendations FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "dayparting_service_write" ON public.dayparting_recommendations FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');

-- ============ PHASE 2C ============

CREATE TABLE IF NOT EXISTS public.local_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('instacart','doordash','gopuff','ubereats')),
  external_event_id text NOT NULL,
  customer_email_hash text,
  sku text,
  qty integer,
  revenue_cents integer,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  capi_status text,
  oci_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS local_delivery_dedup_idx ON public.local_delivery_events (platform, external_event_id);
CREATE INDEX IF NOT EXISTS local_delivery_occurred_idx ON public.local_delivery_events (occurred_at DESC);
ALTER TABLE public.local_delivery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "local_delivery_select" ON public.local_delivery_events FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "local_delivery_service_write" ON public.local_delivery_events FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
