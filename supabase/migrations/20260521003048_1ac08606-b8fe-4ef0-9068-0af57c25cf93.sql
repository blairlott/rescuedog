
CREATE TABLE IF NOT EXISTS public.auto_pause_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  name text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('meta','google','instacart')),
  entity_scope text NOT NULL DEFAULT 'adset' CHECK (entity_scope IN ('campaign','adset','ad','keyword')),
  metric text NOT NULL CHECK (metric IN ('roas','cpa','ctr','spend_no_conv')),
  comparator text NOT NULL DEFAULT 'lt' CHECK (comparator IN ('lt','gt','lte','gte')),
  threshold numeric NOT NULL,
  window_days integer NOT NULL DEFAULT 7,
  min_spend_cents integer NOT NULL DEFAULT 5000,
  dry_run boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auto_pause_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kennel read auto_pause_rules" ON public.auto_pause_rules FOR SELECT USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_ops write auto_pause_rules" ON public.auto_pause_rules FOR ALL USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));
CREATE TRIGGER trg_auto_pause_rules_updated_at BEFORE UPDATE ON public.auto_pause_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.auto_pause_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.auto_pause_rules(id) ON DELETE SET NULL,
  platform text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_name text,
  action text NOT NULL CHECK (action IN ('paused','skipped','dry_run','error')),
  metric_observed numeric,
  spend_cents integer,
  reason text,
  dry_run boolean NOT NULL DEFAULT true,
  response jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auto_pause_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kennel read auto_pause_events" ON public.auto_pause_events FOR SELECT USING (public.can_view_kennel(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_auto_pause_events_created ON public.auto_pause_events(created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_creative_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text,
  product_handle text,
  variant_kind text NOT NULL DEFAULT 'copy' CHECK (variant_kind IN ('copy','image','full')),
  platform text DEFAULT 'meta',
  prompt_seed text,
  headline text,
  primary_text text,
  cta text,
  image_url text,
  image_prompt text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','pushed')),
  generated_by text NOT NULL DEFAULT 'lovable-ai',
  model_used text,
  approved_by uuid,
  approved_at timestamptz,
  pushed_at timestamptz,
  pushed_ad_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_creative_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kennel read ai_creative_variants" ON public.ai_creative_variants FOR SELECT USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_ops write ai_creative_variants" ON public.ai_creative_variants FOR ALL USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));
CREATE TRIGGER trg_ai_creative_variants_updated_at BEFORE UPDATE ON public.ai_creative_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_ai_creative_variants_status ON public.ai_creative_variants(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.seo_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  page_count integer DEFAULT 0,
  recommendations_created integer DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.seo_audit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kennel read seo_audit_runs" ON public.seo_audit_runs FOR SELECT USING (public.can_view_kennel(auth.uid()));

CREATE TABLE IF NOT EXISTS public.seo_page_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.seo_audit_runs(id) ON DELETE SET NULL,
  url text NOT NULL,
  current_title text,
  suggested_title text,
  current_meta_desc text,
  suggested_meta_desc text,
  suggested_h1 text,
  suggested_schema jsonb,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.seo_page_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kennel read seo_page_recommendations" ON public.seo_page_recommendations FOR SELECT USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_ops write seo_page_recommendations" ON public.seo_page_recommendations FOR ALL USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));
CREATE TRIGGER trg_seo_page_recommendations_updated_at BEFORE UPDATE ON public.seo_page_recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_seo_recs_status ON public.seo_page_recommendations(status, created_at DESC);

INSERT INTO public.app_settings (key, value) VALUES
  ('lookalike_autocreate_enabled', 'true'::jsonb),
  ('lookalike_min_seed_size', '100'::jsonb),
  ('auto_pause_enabled', 'true'::jsonb),
  ('ai_creative_autogen_enabled', 'true'::jsonb),
  ('ai_creative_top_sku_limit', '5'::jsonb),
  ('seo_autopilot_enabled', 'true'::jsonb),
  ('product_feed_meta_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
