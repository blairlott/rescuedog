
-- ============================================================
-- SKU CATALOG (varietal/color truth table)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sku_catalog (
  sku TEXT PRIMARY KEY,
  product_name TEXT,
  varietal TEXT,
  color TEXT CHECK (color IS NULL OR color IN ('red','white','rose','sparkling','other')),
  style TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sku_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel can read sku_catalog"
  ON public.sku_catalog FOR SELECT
  USING (public.can_view_kennel(auth.uid()));

CREATE POLICY "ad_ops can write sku_catalog"
  ON public.sku_catalog FOR ALL
  USING (public.is_ad_ops(auth.uid()))
  WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_sku_catalog_updated_at
  BEFORE UPDATE ON public.sku_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed from vs_products_lifetime distinct SKUs (best-effort; color/varietal blank until classified)
INSERT INTO public.sku_catalog (sku, product_name)
SELECT DISTINCT sku, max(name)
FROM public.vs_products_lifetime
WHERE sku IS NOT NULL AND length(trim(sku)) > 0
GROUP BY sku
ON CONFLICT (sku) DO NOTHING;

-- ============================================================
-- META AUDIENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_key TEXT NOT NULL UNIQUE,
  segment_name TEXT NOT NULL,
  segment_kind TEXT NOT NULL DEFAULT 'user_list' CHECK (segment_kind IN ('user_list','meta_rule_based')),
  segment_query TEXT,           -- SQL for user_list; rule JSON ref for meta_rule_based (nullable)
  meta_rule JSONB,              -- meta-side rule for meta_rule_based audiences
  meta_audience_id TEXT,
  meta_audience_name TEXT,
  meta_lookalike_id TEXT,
  lal_ratio NUMERIC NOT NULL DEFAULT 0.01,
  create_lal BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  disabled_reason TEXT,
  sync_cadence TEXT NOT NULL DEFAULT 'monthly' CHECK (sync_cadence IN ('weekly','monthly','manual')),
  last_sync_at TIMESTAMPTZ,
  member_count INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel can read meta_audiences"
  ON public.meta_audiences FOR SELECT
  USING (public.can_view_kennel(auth.uid()));

CREATE POLICY "ad_ops can write meta_audiences"
  ON public.meta_audiences FOR ALL
  USING (public.is_ad_ops(auth.uid()))
  WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_meta_audiences_updated_at
  BEFORE UPDATE ON public.meta_audiences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- META AUDIENCE SYNC RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_audience_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES public.meta_audiences(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  records_pushed INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','success','error','skipped_too_small','skipped_no_token','skipped_disabled')),
  executed_sql TEXT,
  lal_created BOOLEAN DEFAULT false,
  error_message TEXT,
  details JSONB DEFAULT '{}'::jsonb
);
ALTER TABLE public.meta_audience_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel can read sync runs"
  ON public.meta_audience_sync_runs FOR SELECT
  USING (public.can_view_kennel(auth.uid()));

CREATE INDEX idx_meta_audience_sync_runs_segment ON public.meta_audience_sync_runs(segment_id, started_at DESC);

-- ============================================================
-- KENNEL INSIGHTS (trend findings + external signals)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kennel_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  insight_type TEXT NOT NULL,
  scope_key TEXT NOT NULL DEFAULT 'global',
  title TEXT NOT NULL,
  summary TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','opportunity','high','medium','low')),
  source TEXT NOT NULL DEFAULT 'internal' CHECK (source IN ('internal','lindy_external')),
  signal_type TEXT,
  urgency TEXT CHECK (urgency IS NULL OR urgency IN ('low','medium','high')),
  source_url TEXT,
  expires_at TIMESTAMPTZ,
  actioned BOOLEAN NOT NULL DEFAULT false,
  actioned_at TIMESTAMPTZ,
  actioned_by UUID
);
ALTER TABLE public.kennel_insights ENABLE ROW LEVEL SECURITY;

-- Dedupe key: same insight_type + scope on same UTC day = one row
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kennel_insights_dedupe
  ON public.kennel_insights (insight_type, scope_key, ((created_at AT TIME ZONE 'UTC')::date));

CREATE INDEX IF NOT EXISTS idx_kennel_insights_active
  ON public.kennel_insights (actioned, severity, created_at DESC);

CREATE POLICY "kennel can read insights"
  ON public.kennel_insights FOR SELECT
  USING (public.can_view_kennel(auth.uid()));

CREATE POLICY "ad_ops can update insights"
  ON public.kennel_insights FOR UPDATE
  USING (public.is_ad_ops(auth.uid()))
  WITH CHECK (public.is_ad_ops(auth.uid()));

-- ============================================================
-- READ-ONLY SQL EXECUTOR for segment queries
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_meta_segment_sql(_sql TEXT, _limit INTEGER DEFAULT NULL)
RETURNS TABLE(
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  city TEXT,
  state TEXT,
  zip TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized TEXT;
  _wrapped TEXT;
BEGIN
  IF NOT public.is_ad_ops(auth.uid()) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied: ad_ops or service role required';
  END IF;

  IF _sql IS NULL OR length(trim(_sql)) = 0 THEN
    RAISE EXCEPTION 'empty sql';
  END IF;

  _normalized := lower(trim(_sql));
  IF position('select' in _normalized) <> 1 THEN
    RAISE EXCEPTION 'only SELECT statements allowed';
  END IF;
  IF _normalized ~ '(;\s*\S|insert\s|update\s|delete\s|drop\s|alter\s|create\s|grant\s|revoke\s|truncate\s|copy\s|do\s|call\s|comment\s|vacuum\s|analyze\s)' THEN
    RAISE EXCEPTION 'forbidden keyword in query';
  END IF;

  PERFORM set_config('statement_timeout', '30s', true);
  PERFORM set_config('transaction_read_only', 'on', true);

  _wrapped := 'SELECT email::text, phone::text, first_name::text, last_name::text, city::text, state::text, zip::text FROM (' || _sql || ') seg';
  IF _limit IS NOT NULL THEN
    _wrapped := _wrapped || ' LIMIT ' || _limit::text;
  END IF;

  RETURN QUERY EXECUTE _wrapped;
END;
$$;

REVOKE ALL ON FUNCTION public.run_meta_segment_sql(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_meta_segment_sql(TEXT, INTEGER) TO authenticated, service_role;

-- ============================================================
-- SEED META AUDIENCES
-- ============================================================
-- All segments select 7 normalized columns (email, phone, first_name, last_name, city, state, zip)
INSERT INTO public.meta_audiences (segment_key, segment_name, segment_kind, segment_query, sync_cadence, create_lal, lal_ratio, enabled, disabled_reason, notes) VALUES

('all_wine_buyers_24mo', 'All Wine Buyers (24mo)', 'user_list',
 $sql$SELECT DISTINCT lower(customer_email) AS email, customer_phone AS phone, customer_first_name AS first_name, customer_last_name AS last_name, ship_to_city AS city, ship_to_state AS state, ship_to_zip AS zip
      FROM public.vs_transactions
      WHERE customer_email IS NOT NULL
        AND transaction_date >= (current_date - interval '24 months')
        AND coalesce(order_total,0) > 0$sql$,
 'monthly', true, 0.03, true, NULL, 'Broad seed for prospecting LAL'),

('wine_club_members', 'Wine Club / Pack Members', 'user_list',
 $sql$SELECT DISTINCT lower(customer_email) AS email, customer_phone AS phone, customer_first_name AS first_name, customer_last_name AS last_name, ship_to_city AS city, ship_to_state AS state, ship_to_zip AS zip
      FROM public.vs_transactions
      WHERE customer_email IS NOT NULL
        AND (active_club_member = true OR club IS NOT NULL)
        AND transaction_date >= (current_date - interval '90 days')$sql$,
 'monthly', false, 0.01, true, NULL, 'Member retention + exclusion list'),

('high_historical_revenue', 'High Historical Revenue ($500+)', 'user_list',
 $sql$WITH agg AS (
   SELECT lower(customer_email) AS email,
          max(customer_phone) AS phone,
          max(customer_first_name) AS first_name,
          max(customer_last_name) AS last_name,
          max(ship_to_city) AS city,
          max(ship_to_state) AS state,
          max(ship_to_zip) AS zip,
          sum(coalesce(order_total,0)) AS ltv,
          count(*) AS orders
   FROM public.vs_transactions
   WHERE customer_email IS NOT NULL
   GROUP BY 1
 )
 SELECT email, phone, first_name, last_name, city, state, zip
 FROM agg WHERE ltv > 500 OR orders >= 5$sql$,
 'monthly', true, 0.01, true, NULL, 'Renamed from "VIPs" — historical spend not true LTV'),

('top_quintile_historical_revenue', 'Top 20% Historical Revenue (Whales)', 'user_list',
 $sql$WITH agg AS (
   SELECT lower(customer_email) AS email, max(customer_phone) AS phone, max(customer_first_name) AS first_name,
          max(customer_last_name) AS last_name, max(ship_to_city) AS city, max(ship_to_state) AS state,
          max(ship_to_zip) AS zip, sum(coalesce(order_total,0)) AS ltv,
          ntile(5) OVER (ORDER BY sum(coalesce(order_total,0))) AS quintile
   FROM public.vs_transactions WHERE customer_email IS NOT NULL GROUP BY 1
 )
 SELECT email, phone, first_name, last_name, city, state, zip FROM agg WHERE quintile = 5$sql$,
 'monthly', true, 0.01, true, NULL, 'Whale LAL seed — tightest similarity'),

('lapsed_buyers_90d', 'Lapsed Buyers (no order 90d+)', 'user_list',
 $sql$WITH last_order AS (
   SELECT lower(customer_email) AS email, max(transaction_date) AS last_d,
          max(customer_phone) AS phone, max(customer_first_name) AS first_name,
          max(customer_last_name) AS last_name, max(ship_to_city) AS city,
          max(ship_to_state) AS state, max(ship_to_zip) AS zip
   FROM public.vs_transactions WHERE customer_email IS NOT NULL GROUP BY 1
 )
 SELECT email, phone, first_name, last_name, city, state, zip
 FROM last_order WHERE last_d < current_date - interval '90 days'$sql$,
 'weekly', false, 0.01, true, NULL, 'Winback targeting'),

('recent_buyers_30d', 'Recent Buyers (30d) — Exclusion', 'user_list',
 $sql$SELECT DISTINCT lower(customer_email) AS email, customer_phone AS phone, customer_first_name AS first_name, customer_last_name AS last_name, ship_to_city AS city, ship_to_state AS state, ship_to_zip AS zip
      FROM public.vs_transactions
      WHERE customer_email IS NOT NULL AND transaction_date >= current_date - interval '30 days'$sql$,
 'weekly', false, 0.01, true, NULL, 'Exclude from acquisition campaigns'),

('high_aov_single_buyers', 'High-AOV Single Buyers ($150+, no repeat)', 'user_list',
 $sql$WITH per AS (
   SELECT lower(customer_email) AS email, count(*) AS orders, max(coalesce(order_total,0)) AS max_total,
          max(customer_phone) AS phone, max(customer_first_name) AS first_name,
          max(customer_last_name) AS last_name, max(ship_to_city) AS city,
          max(ship_to_state) AS state, max(ship_to_zip) AS zip
   FROM public.vs_transactions WHERE customer_email IS NOT NULL GROUP BY 1
 )
 SELECT email, phone, first_name, last_name, city, state, zip
 FROM per WHERE orders = 1 AND max_total >= 150$sql$,
 'monthly', true, 0.03, true, NULL, 'Subscription conversion targeting'),

('case_buyers', 'Case Buyers (9+ bottles in one order)', 'user_list',
 $sql$SELECT DISTINCT lower(customer_email) AS email, customer_phone AS phone, customer_first_name AS first_name, customer_last_name AS last_name, ship_to_city AS city, ship_to_state AS state, ship_to_zip AS zip
      FROM public.vs_transactions WHERE customer_email IS NOT NULL AND coalesce(bottles,0) >= 9$sql$,
 'monthly', true, 0.05, true, NULL, 'Proxy for case buyers via bottles>=9'),

('fast_second_order', 'Fast Second-Order Buyers (<=60d gap)', 'user_list',
 $sql$WITH ordered AS (
   SELECT lower(customer_email) AS email, transaction_date,
          row_number() OVER (PARTITION BY lower(customer_email) ORDER BY transaction_date) AS rn,
          customer_phone, customer_first_name, customer_last_name, ship_to_city, ship_to_state, ship_to_zip
   FROM public.vs_transactions WHERE customer_email IS NOT NULL
 ),
 pairs AS (
   SELECT a.email, (b.transaction_date - a.transaction_date) AS gap,
          max(a.customer_phone) AS phone, max(a.customer_first_name) AS first_name,
          max(a.customer_last_name) AS last_name, max(a.ship_to_city) AS city,
          max(a.ship_to_state) AS state, max(a.ship_to_zip) AS zip
   FROM ordered a JOIN ordered b ON a.email = b.email AND a.rn = 1 AND b.rn = 2
   GROUP BY a.email, gap
 )
 SELECT email, phone, first_name, last_name, city, state, zip FROM pairs WHERE gap <= 60$sql$,
 'monthly', true, 0.03, true, NULL, 'High-velocity converters — LAL skipped if <100'),

('red_wine_buyers', 'Red Wine Buyers', 'user_list',
 $sql$SELECT DISTINCT lower(t.customer_email) AS email, t.customer_phone AS phone, t.customer_first_name AS first_name, t.customer_last_name AS last_name, t.ship_to_city AS city, t.ship_to_state AS state, t.ship_to_zip AS zip
      FROM public.vs_transactions t WHERE false /* awaiting line-item ingest + sku_catalog classification */$sql$,
 'monthly', true, 0.05, false, 'No per-order SKU line items in vs_transactions yet', 'Activate once line-item ingest + sku_catalog colors are populated'),

('white_rose_buyers', 'White / Rosé / Sparkling Buyers', 'user_list',
 $sql$SELECT DISTINCT lower(t.customer_email) AS email, t.customer_phone AS phone, t.customer_first_name AS first_name, t.customer_last_name AS last_name, t.ship_to_city AS city, t.ship_to_state AS state, t.ship_to_zip AS zip
      FROM public.vs_transactions t WHERE false$sql$,
 'monthly', true, 0.05, false, 'No per-order SKU line items in vs_transactions yet', 'Activate once line-item ingest + sku_catalog colors are populated'),

('meta_video_75_180d', 'Video Viewers 75%+ (180d)', 'meta_rule_based', NULL, 'manual', false, 0.01, true, NULL, 'Defined Meta-side as engagement rule audience'),
('meta_abandoned_checkout_14d', 'Abandoned Checkout (14d)', 'meta_rule_based', NULL, 'weekly', false, 0.01, true, NULL, 'Defined Meta-side as engagement rule audience'),
('meta_pdp_visitors_30d', 'Product Page Visitors (30d)', 'meta_rule_based', NULL, 'weekly', false, 0.01, true, NULL, 'Defined Meta-side as engagement rule audience')

ON CONFLICT (segment_key) DO NOTHING;
