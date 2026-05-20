
-- 1) Platforms catalog
CREATE TABLE IF NOT EXISTS public.ad_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'search', -- search | social | retail_media | dsp | ctv | audio | other
  status TEXT NOT NULL DEFAULT 'candidate', -- active | candidate | rejected | beta
  fit_score INT NOT NULL DEFAULT 0, -- 0..100
  alcohol_compliant BOOLEAN,
  api_maturity TEXT, -- none | partner_only | public_rest | public_graphql
  homepage_url TEXT,
  docs_url TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_platforms read kennel" ON public.ad_platforms FOR SELECT
  USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_platforms write ad_ops" ON public.ad_platforms FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));
CREATE TRIGGER tg_ad_platforms_updated BEFORE UPDATE ON public.ad_platforms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Campaigns
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_slug TEXT NOT NULL,
  external_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown', -- enabled | paused | ended | unknown
  objective TEXT,
  daily_budget_cents INT,
  lifetime_budget_cents INT,
  spend_mtd_cents INT NOT NULL DEFAULT 0,
  sales_mtd_cents INT NOT NULL DEFAULT 0,
  impressions_mtd BIGINT NOT NULL DEFAULT 0,
  clicks_mtd BIGINT NOT NULL DEFAULT 0,
  conversions_mtd INT NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform_slug, external_id)
);
CREATE INDEX IF NOT EXISTS ix_ad_campaigns_platform ON public.ad_campaigns (platform_slug, status);
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_campaigns read kennel" ON public.ad_campaigns FOR SELECT
  USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_campaigns write ad_ops" ON public.ad_campaigns FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));
CREATE TRIGGER tg_ad_campaigns_updated BEFORE UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Ad groups
CREATE TABLE IF NOT EXISTS public.ad_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  default_bid_cents INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, external_id)
);
ALTER TABLE public.ad_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_groups read kennel" ON public.ad_groups FOR SELECT
  USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_groups write ad_ops" ON public.ad_groups FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));
CREATE TRIGGER tg_ad_groups_updated BEFORE UPDATE ON public.ad_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Keywords (unified across platforms)
CREATE TABLE IF NOT EXISTS public.ad_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_slug TEXT NOT NULL,
  campaign_id UUID REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  ad_group_id UUID REFERENCES public.ad_groups(id) ON DELETE CASCADE,
  external_id TEXT,
  keyword TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'broad', -- exact | phrase | broad | negative
  status TEXT NOT NULL DEFAULT 'enabled',
  bid_cents INT,
  suggested_bid_cents INT,
  impressions_30d BIGINT NOT NULL DEFAULT 0,
  clicks_30d BIGINT NOT NULL DEFAULT 0,
  spend_30d_cents INT NOT NULL DEFAULT 0,
  conversions_30d INT NOT NULL DEFAULT 0,
  sales_30d_cents INT NOT NULL DEFAULT 0,
  quality_score NUMERIC(5,2),
  last_synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform_slug, external_id)
);
CREATE INDEX IF NOT EXISTS ix_ad_keywords_platform ON public.ad_keywords (platform_slug, status);
CREATE INDEX IF NOT EXISTS ix_ad_keywords_kw ON public.ad_keywords (lower(keyword));
ALTER TABLE public.ad_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_keywords read kennel" ON public.ad_keywords FOR SELECT
  USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_keywords write ad_ops" ON public.ad_keywords FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));
CREATE TRIGGER tg_ad_keywords_updated BEFORE UPDATE ON public.ad_keywords
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Search terms (actual queries that triggered ads)
CREATE TABLE IF NOT EXISTS public.ad_search_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_slug TEXT NOT NULL,
  keyword_id UUID REFERENCES public.ad_keywords(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  spend_cents INT NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  sales_cents INT NOT NULL DEFAULT 0,
  suggested_action TEXT, -- promote | negative | ignore
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ad_search_terms_platform ON public.ad_search_terms (platform_slug, observed_at DESC);
ALTER TABLE public.ad_search_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_search_terms read kennel" ON public.ad_search_terms FOR SELECT
  USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_search_terms write ad_ops" ON public.ad_search_terms FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

-- 6) Platform radar alerts
CREATE TABLE IF NOT EXISTS public.platform_radar_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_slug TEXT NOT NULL,
  alert_type TEXT NOT NULL, -- new_platform | policy_change | opportunity | risk
  severity TEXT NOT NULL DEFAULT 'info', -- info | low | medium | high
  title TEXT NOT NULL,
  summary TEXT,
  recommended_action TEXT,
  projected_value JSONB,
  source_url TEXT,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_platform_radar_open ON public.platform_radar_alerts (created_at DESC) WHERE dismissed_at IS NULL;
ALTER TABLE public.platform_radar_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar read kennel" ON public.platform_radar_alerts FOR SELECT
  USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "radar write ad_ops" ON public.platform_radar_alerts FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

-- 7) Helper: open radar alert count
CREATE OR REPLACE FUNCTION public.platform_radar_open_count()
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INT FROM public.platform_radar_alerts WHERE dismissed_at IS NULL;
$$;
