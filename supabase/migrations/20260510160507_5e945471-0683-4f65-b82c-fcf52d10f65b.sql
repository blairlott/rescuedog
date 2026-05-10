
-- LOCATOR SEARCHES
CREATE TABLE public.locator_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_miles INTEGER DEFAULT 25,
  premise_filter TEXT,
  product_filter TEXT,
  results_count INTEGER DEFAULT 0,
  user_id UUID,
  session_id TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_locator_searches_zip ON public.locator_searches(zip);
CREATE INDEX idx_locator_searches_created ON public.locator_searches(created_at DESC);
ALTER TABLE public.locator_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can log a locator search" ON public.locator_searches
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins can view locator searches" ON public.locator_searches
  FOR SELECT TO authenticated USING (is_admin_or_owner(auth.uid()));

-- RETAILER SUGGESTIONS
CREATE TABLE public.retailer_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL,
  street_address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  contact_name TEXT,
  contact_email TEXT,
  premise_type TEXT DEFAULT 'off',
  notes TEXT,
  submitter_user_id UUID,
  submitter_email TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  promoted_account_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.retailer_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can submit a retailer suggestion" ON public.retailer_suggestions
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins can view retailer suggestions" ON public.retailer_suggestions
  FOR SELECT TO authenticated USING (is_admin_or_owner(auth.uid()));
CREATE POLICY "admins can update retailer suggestions" ON public.retailer_suggestions
  FOR UPDATE TO authenticated USING (is_admin_or_owner(auth.uid()));

-- AUDIT LOG
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_email TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  before JSONB,
  after JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_actor ON public.audit_log(actor_user_id);
CREATE INDEX idx_audit_log_created ON public.audit_log(created_at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can view audit log" ON public.audit_log
  FOR SELECT TO authenticated USING (is_admin_or_owner(auth.uid()));
CREATE POLICY "authenticated users can write audit log" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- FEATURE FLAGS
CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read feature flags" ON public.feature_flags
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage feature flags" ON public.feature_flags
  FOR ALL TO authenticated USING (is_admin_or_owner(auth.uid())) WITH CHECK (is_admin_or_owner(auth.uid()));

INSERT INTO public.feature_flags (key, enabled, description, audience) VALUES
  ('native_locator', false, 'Use native store locator instead of Grappos iframe', 'all'),
  ('impact_counter', false, 'Show live rescue impact counter on homepage', 'all'),
  ('partner_portal', false, 'Enable rescue partner portal', 'partners'),
  ('ai_signal_engine', false, 'Phase 4 retail signal engine', 'admin'),
  ('depletion_parser', false, 'Phase 3 AI depletion parser', 'admin');

-- CONTENT INDEX (WP bridge)
CREATE TABLE public.content_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'wordpress',
  external_id TEXT,
  slug TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'post',
  title TEXT NOT NULL,
  excerpt TEXT,
  body_html TEXT,
  cover_image_url TEXT,
  author TEXT,
  tags TEXT[] DEFAULT '{}'::text[],
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_public BOOLEAN NOT NULL DEFAULT true,
  raw JSONB,
  UNIQUE (source, slug)
);
CREATE INDEX idx_content_index_published ON public.content_index(published_at DESC) WHERE is_public = true;
CREATE INDEX idx_content_index_tags ON public.content_index USING GIN(tags);
ALTER TABLE public.content_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can view public content" ON public.content_index
  FOR SELECT TO anon, authenticated USING (is_public = true);
CREATE POLICY "admins manage content index" ON public.content_index
  FOR ALL TO authenticated USING (is_admin_or_owner(auth.uid())) WITH CHECK (is_admin_or_owner(auth.uid()));

-- IMPACT EVENTS (rescue-funding ledger)
CREATE TABLE public.impact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  customer_email TEXT,
  vinoshipper_order_id TEXT,
  rescue_partner_id UUID REFERENCES public.rescue_partners(id) ON DELETE SET NULL,
  bottles INTEGER NOT NULL DEFAULT 0,
  donation_cents INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'order',
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_impact_events_user ON public.impact_events(user_id);
CREATE INDEX idx_impact_events_rescue ON public.impact_events(rescue_partner_id);
CREATE INDEX idx_impact_events_occurred ON public.impact_events(occurred_at DESC);
ALTER TABLE public.impact_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can view own impact" ON public.impact_events
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin_or_owner(auth.uid()));
CREATE POLICY "admins manage impact events" ON public.impact_events
  FOR ALL TO authenticated USING (is_admin_or_owner(auth.uid())) WITH CHECK (is_admin_or_owner(auth.uid()));

-- Public aggregate function (no PII)
CREATE OR REPLACE FUNCTION public.get_public_impact_totals()
RETURNS TABLE(total_bottles BIGINT, total_donation_cents BIGINT, total_customers BIGINT, total_rescues BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(bottles), 0)::BIGINT,
    COALESCE(SUM(donation_cents), 0)::BIGINT,
    COUNT(DISTINCT user_id)::BIGINT,
    COUNT(DISTINCT rescue_partner_id)::BIGINT
  FROM public.impact_events
$$;

-- SALES ACCOUNTS additions
ALTER TABLE public.sales_accounts
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dma TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::text[];

-- Public read of public-listed accounts only (locator data)
CREATE POLICY "anyone can view public sales accounts" ON public.sales_accounts
  FOR SELECT TO anon USING (is_public = true);

-- TIED-HOUSE COMPLIANT RETAILER SET
-- Returns at least `min_count` unaffiliated public retailers near a zip,
-- expanding the search radius if needed. Used by every "where to buy" comm.
CREATE OR REPLACE FUNCTION public.compliant_retailer_set(
  _latitude DOUBLE PRECISION,
  _longitude DOUBLE PRECISION,
  _min_count INTEGER DEFAULT 3,
  _premise_filter TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  account_name TEXT,
  street_address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  website TEXT,
  premise_type TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_miles DOUBLE PRECISION
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH scored AS (
    SELECT
      sa.id, sa.account_name, sa.street_address, sa.city, sa.state, sa.zip,
      sa.phone, sa.website, sa.premise_type, sa.latitude, sa.longitude,
      CASE
        WHEN sa.latitude IS NULL OR sa.longitude IS NULL THEN NULL
        ELSE 3958.8 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(_latitude)) * cos(radians(sa.latitude)) *
            cos(radians(sa.longitude) - radians(_longitude)) +
            sin(radians(_latitude)) * sin(radians(sa.latitude))
          ))
        )
      END AS distance_miles
    FROM public.sales_accounts sa
    WHERE sa.is_public = true
      AND sa.status IN ('active', 'customer')
      AND (_premise_filter IS NULL OR sa.premise_type = _premise_filter)
  )
  SELECT * FROM scored
  WHERE distance_miles IS NOT NULL
  ORDER BY distance_miles ASC
  LIMIT GREATEST(_min_count, 25)
$$;

-- Trigger: keep updated_at fresh on feature_flags + content_index
CREATE TRIGGER trg_feature_flags_updated
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
