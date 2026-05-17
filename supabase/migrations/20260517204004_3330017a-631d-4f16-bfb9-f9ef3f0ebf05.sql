CREATE OR REPLACE FUNCTION public.is_executive(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner','admin','executive')
  )
$$;

CREATE TABLE IF NOT EXISTS public.business_revenue_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  channel text NOT NULL,
  sku text, product_name text, state text, customer_segment text,
  orders integer NOT NULL DEFAULT 0,
  units integer NOT NULL DEFAULT 0,
  gross_revenue_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  shipping_cents bigint NOT NULL DEFAULT 0,
  tax_cents bigint NOT NULL DEFAULT 0,
  net_revenue_cents bigint NOT NULL DEFAULT 0,
  cogs_cents bigint NOT NULL DEFAULT 0,
  margin_cents bigint NOT NULL DEFAULT 0,
  unique_customers integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'rollup',
  dim_hash text GENERATED ALWAYS AS (
    md5(channel || '|' || coalesce(sku,'') || '|' || coalesce(state,'') || '|' || coalesce(customer_segment,''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS biz_facts_unique ON public.business_revenue_facts (date, dim_hash);
CREATE INDEX IF NOT EXISTS biz_facts_channel_date ON public.business_revenue_facts (channel, date DESC);
CREATE INDEX IF NOT EXISTS biz_facts_sku ON public.business_revenue_facts (sku, date DESC) WHERE sku IS NOT NULL;
ALTER TABLE public.business_revenue_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "biz_facts_read" ON public.business_revenue_facts FOR SELECT
  USING (public.is_executive(auth.uid()) OR public.is_ad_ops(auth.uid()));
CREATE POLICY "biz_facts_write" ON public.business_revenue_facts FOR ALL
  USING (public.is_executive(auth.uid())) WITH CHECK (public.is_executive(auth.uid()));
CREATE TRIGGER biz_facts_updated_at BEFORE UPDATE ON public.business_revenue_facts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.customer_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  customer_email text,
  acquisition_month date,
  first_order_at timestamptz,
  last_order_at timestamptz,
  orders_count integer NOT NULL DEFAULT 0,
  lifetime_revenue_cents bigint NOT NULL DEFAULT 0,
  avg_order_value_cents bigint NOT NULL DEFAULT 0,
  days_since_last_order integer,
  is_club_member boolean NOT NULL DEFAULT false,
  segment text,
  churn_probability numeric(4,3),
  predicted_ltv_cents bigint,
  state text,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cohort_user_idx ON public.customer_cohorts (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cohort_email_idx ON public.customer_cohorts (customer_email) WHERE user_id IS NULL AND customer_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS cohort_segment_idx ON public.customer_cohorts (segment);
CREATE INDEX IF NOT EXISTS cohort_churn_idx ON public.customer_cohorts (churn_probability DESC);
ALTER TABLE public.customer_cohorts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cohort_read" ON public.customer_cohorts FOR SELECT
  USING (public.is_executive(auth.uid()) OR public.is_ad_ops(auth.uid()));
CREATE POLICY "cohort_write" ON public.customer_cohorts FOR ALL
  USING (public.is_executive(auth.uid())) WITH CHECK (public.is_executive(auth.uid()));

CREATE TABLE IF NOT EXISTS public.attribution_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  order_date timestamptz NOT NULL,
  order_revenue_cents bigint NOT NULL DEFAULT 0,
  user_id uuid,
  touchpoints jsonb NOT NULL,
  last_touch_credit jsonb,
  position_based_credit jsonb,
  time_decay_credit jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS attr_order_idx ON public.attribution_paths (order_id);
CREATE INDEX IF NOT EXISTS attr_date_idx ON public.attribution_paths (order_date DESC);
ALTER TABLE public.attribution_paths ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attr_read" ON public.attribution_paths FOR SELECT
  USING (public.is_executive(auth.uid()) OR public.is_ad_ops(auth.uid()));
CREATE POLICY "attr_write" ON public.attribution_paths FOR ALL
  USING (public.is_executive(auth.uid())) WITH CHECK (public.is_executive(auth.uid()));

CREATE TABLE IF NOT EXISTS public.executive_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority smallint NOT NULL DEFAULT 50,
  category text NOT NULL,
  scope text NOT NULL,
  scope_id text,
  title text NOT NULL,
  narrative text,
  recommended_action text NOT NULL,
  action_kind text NOT NULL,
  action_payload jsonb NOT NULL DEFAULT '{}',
  estimated_impact_cents bigint,
  confidence numeric(4,3),
  status text NOT NULL DEFAULT 'pending',
  auto_executable boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  executed_at timestamptz,
  execution_result jsonb,
  source_engine text,
  related_record_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_open_idx ON public.executive_decisions (priority DESC, created_at DESC)
  WHERE status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS decisions_category_idx ON public.executive_decisions (category, status);
ALTER TABLE public.executive_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decisions_read" ON public.executive_decisions FOR SELECT
  USING (public.is_executive(auth.uid()) OR public.is_ad_ops(auth.uid()));
CREATE POLICY "decisions_write" ON public.executive_decisions FOR ALL
  USING (public.is_executive(auth.uid()) OR public.is_ad_ops(auth.uid()))
  WITH CHECK (public.is_executive(auth.uid()) OR public.is_ad_ops(auth.uid()));
CREATE TRIGGER decisions_updated_at BEFORE UPDATE ON public.executive_decisions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_settings' AND policyname='settings_admin_all') THEN
    CREATE POLICY "settings_admin_all" ON public.app_settings FOR ALL
      USING (public.is_admin_or_owner(auth.uid())) WITH CHECK (public.is_admin_or_owner(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_settings' AND policyname='settings_read_authed') THEN
    CREATE POLICY "settings_read_authed" ON public.app_settings FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.approve_executive_decision(_decision_id uuid, _action text)
RETURNS public.executive_decisions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _rec public.executive_decisions;
BEGIN
  IF NOT (public.is_executive(_uid) OR public.is_ad_ops(_uid)) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF _action NOT IN ('approve','reject','snooze') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;
  UPDATE public.executive_decisions
     SET status = CASE _action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'snoozed' END,
         approved_by = _uid, approved_at = now(), updated_at = now()
   WHERE id = _decision_id
  RETURNING * INTO _rec;
  RETURN _rec;
END;
$$;