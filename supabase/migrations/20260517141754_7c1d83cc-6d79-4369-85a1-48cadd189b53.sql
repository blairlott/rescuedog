
-- =========================================================
-- ad_channels
-- =========================================================
CREATE TABLE public.ad_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  api_endpoint TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel_channels_select"
  ON public.ad_channels FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()) OR public.has_role(auth.uid(), 'ad_ops_manager'));

CREATE POLICY "kennel_channels_admin_write"
  ON public.ad_channels FOR ALL
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER ad_channels_updated_at
  BEFORE UPDATE ON public.ad_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- ad_performance_daily
-- =========================================================
CREATE TABLE public.ad_performance_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.ad_channels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  roas NUMERIC(8,3) GENERATED ALWAYS AS (CASE WHEN spend > 0 THEN revenue / spend ELSE 0 END) STORED,
  cpa  NUMERIC(12,2) GENERATED ALWAYS AS (CASE WHEN conversions > 0 THEN spend / conversions ELSE 0 END) STORED,
  source TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('lindy','backup_cron','seed','manual')),
  ingest_request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, date)
);

CREATE INDEX ad_performance_daily_date_idx ON public.ad_performance_daily(date DESC);
CREATE INDEX ad_performance_daily_channel_date_idx ON public.ad_performance_daily(channel_id, date DESC);
CREATE UNIQUE INDEX ad_performance_daily_request_id_idx
  ON public.ad_performance_daily(ingest_request_id)
  WHERE ingest_request_id IS NOT NULL;

ALTER TABLE public.ad_performance_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel_perf_select"
  ON public.ad_performance_daily FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()) OR public.has_role(auth.uid(), 'ad_ops_manager'));
-- No INSERT/UPDATE/DELETE policies: only service_role can write.

CREATE TRIGGER ad_performance_daily_updated_at
  BEFORE UPDATE ON public.ad_performance_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- channel_sync_status
-- =========================================================
CREATE TABLE public.channel_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL UNIQUE REFERENCES public.ad_channels(id) ON DELETE CASCADE,
  last_primary_sync TIMESTAMPTZ,
  last_backup_sync TIMESTAMPTZ,
  last_sync_source TEXT CHECK (last_sync_source IN ('lindy','backup_cron','seed')),
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('fresh','stale','error','pending')),
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel_sync_select"
  ON public.channel_sync_status FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()) OR public.has_role(auth.uid(), 'ad_ops_manager'));
-- No client write policies; edge functions use service_role.

CREATE TRIGGER channel_sync_status_updated_at
  BEFORE UPDATE ON public.channel_sync_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Helper: is_ad_ops (admin/owner OR ad_ops_manager)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_ad_ops(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_or_owner(_user_id)
      OR public.has_role(_user_id, 'ad_ops_manager');
$$;
