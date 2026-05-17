
-- paid_link_tags: registry of canonical UTM bundles
CREATE TABLE public.paid_link_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  campaign_id text,
  ad_group_id text,
  ad_id text,
  destination_url text NOT NULL,
  utm_source text NOT NULL,
  utm_medium text NOT NULL,
  utm_campaign text NOT NULL,
  utm_content text,
  utm_term text,
  tagged_url text NOT NULL,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_paid_link_tags_channel ON public.paid_link_tags(channel);
CREATE INDEX idx_paid_link_tags_campaign ON public.paid_link_tags(campaign_id);
CREATE UNIQUE INDEX idx_paid_link_tags_utm_combo ON public.paid_link_tags(utm_source, utm_medium, utm_campaign, COALESCE(utm_content, ''), COALESCE(utm_term, ''));

ALTER TABLE public.paid_link_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_ops manage paid_link_tags" ON public.paid_link_tags
  FOR ALL USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_paid_link_tags_updated
  BEFORE UPDATE ON public.paid_link_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- channel_attribution_events: raw clicks + conversions
CREATE TABLE public.channel_attribution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('click','conversion')),
  visitor_id text,
  user_id uuid,
  channel text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_url text,
  referrer text,
  order_id text,
  order_value_cents integer,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_attr_events_visitor ON public.channel_attribution_events(visitor_id, occurred_at DESC);
CREATE INDEX idx_attr_events_order ON public.channel_attribution_events(order_id);
CREATE INDEX idx_attr_events_channel_day ON public.channel_attribution_events(channel, occurred_at);

ALTER TABLE public.channel_attribution_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_ops read attribution_events" ON public.channel_attribution_events
  FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "service writes attribution_events" ON public.channel_attribution_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role' OR public.is_ad_ops(auth.uid()));

-- channel_performance_daily: rolled up nightly (regular table, not matview — easier to upsert)
CREATE TABLE public.channel_performance_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  channel text NOT NULL,
  campaign_id text,
  spend_cents bigint NOT NULL DEFAULT 0,
  platform_reported_revenue_cents bigint NOT NULL DEFAULT 0,
  attributed_revenue_cents bigint NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  attribution_quality text NOT NULL DEFAULT 'full' CHECK (attribution_quality IN ('full','partial','unmatched')),
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_channel_perf_day_channel_campaign ON public.channel_performance_daily(day, channel, COALESCE(campaign_id, ''));
CREATE INDEX idx_channel_perf_day ON public.channel_performance_daily(day DESC);

ALTER TABLE public.channel_performance_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_ops read channel_perf" ON public.channel_performance_daily
  FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "service writes channel_perf" ON public.channel_performance_daily
  FOR ALL USING (auth.role() = 'service_role' OR public.is_ad_ops(auth.uid()))
  WITH CHECK (auth.role() = 'service_role' OR public.is_ad_ops(auth.uid()));

-- holdout_assignments: 5% incrementality holdout
CREATE TABLE public.holdout_assignments (
  visitor_id text PRIMARY KEY,
  user_id uuid,
  in_holdout boolean NOT NULL,
  bucket smallint NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_holdout_user ON public.holdout_assignments(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_holdout_in_holdout ON public.holdout_assignments(in_holdout);

ALTER TABLE public.holdout_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_ops read holdout" ON public.holdout_assignments
  FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "service writes holdout" ON public.holdout_assignments
  FOR ALL USING (auth.role() = 'service_role' OR public.is_ad_ops(auth.uid()))
  WITH CHECK (auth.role() = 'service_role' OR public.is_ad_ops(auth.uid()));
-- Public can self-assign via edge fn (service role); no direct client writes.
