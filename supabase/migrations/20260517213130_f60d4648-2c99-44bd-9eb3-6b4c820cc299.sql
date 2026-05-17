-- 1. New view-only role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kennel_viewer';

-- (commit enum value before using it in function bodies)
COMMIT;
BEGIN;

-- 2. Helper: anyone allowed to VIEW The Kennel
CREATE OR REPLACE FUNCTION public.can_view_kennel(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('owner','admin','ad_ops_manager','executive','kennel_viewer')
  )
$$;

-- 3. Open SELECT to viewers across Kennel-relevant tables (writes unchanged)
DROP POLICY IF EXISTS "kennel_channels_select" ON public.ad_channels;
CREATE POLICY "kennel_channels_select" ON public.ad_channels
  FOR SELECT USING (public.can_view_kennel(auth.uid()));

DROP POLICY IF EXISTS "kennel_perf_select" ON public.ad_performance_daily;
CREATE POLICY "kennel_perf_select" ON public.ad_performance_daily
  FOR SELECT USING (public.can_view_kennel(auth.uid()));

DROP POLICY IF EXISTS "kennel_sync_select" ON public.channel_sync_status;
CREATE POLICY "kennel_sync_select" ON public.channel_sync_status
  FOR SELECT USING (public.can_view_kennel(auth.uid()));

DROP POLICY IF EXISTS "biz_facts_read" ON public.business_revenue_facts;
CREATE POLICY "biz_facts_read" ON public.business_revenue_facts
  FOR SELECT USING (public.can_view_kennel(auth.uid()));

DROP POLICY IF EXISTS "biz_expense_read" ON public.business_expense_facts;
CREATE POLICY "biz_expense_read" ON public.business_expense_facts
  FOR SELECT USING (public.can_view_kennel(auth.uid()));

DROP POLICY IF EXISTS "admins view tx" ON public.vs_transactions;
CREATE POLICY "kennel_tx_select" ON public.vs_transactions
  FOR SELECT USING (public.can_view_kennel(auth.uid()));

DROP POLICY IF EXISTS "admins view carts" ON public.vs_abandoned_carts;
CREATE POLICY "kennel_carts_select" ON public.vs_abandoned_carts
  FOR SELECT USING (public.can_view_kennel(auth.uid()));