
CREATE TABLE public.kennel_keyword_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('google','instacart')),
  campaign_id text,
  ad_group_id text NOT NULL,
  keyword text NOT NULL,
  match_type text NOT NULL DEFAULT 'phrase' CHECK (match_type IN ('exact','phrase','broad')),
  source text NOT NULL CHECK (source IN ('ai','google_plan','semrush','search_term')),
  score int NOT NULL DEFAULT 0,
  recommended_action text NOT NULL CHECK (recommended_action IN ('add','negative','raise_bid','lower_bid','pause')),
  recommended_bid_micros bigint,
  volume int,
  cpc_micros bigint,
  competition text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','awaiting_approval','applied','rejected','failed')),
  reasoning text,
  executed_resource_name text,
  execution_response jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kki_adgroup_status ON public.kennel_keyword_ideas (platform, ad_group_id, status);
CREATE INDEX idx_kki_created ON public.kennel_keyword_ideas (created_at DESC);
CREATE UNIQUE INDEX uq_kki_keyword ON public.kennel_keyword_ideas (platform, ad_group_id, lower(keyword), match_type, recommended_action);

ALTER TABLE public.kennel_keyword_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad ops can read keyword ideas"
  ON public.kennel_keyword_ideas FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "ad ops can insert keyword ideas"
  ON public.kennel_keyword_ideas FOR INSERT
  WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE POLICY "ad ops can update keyword ideas"
  ON public.kennel_keyword_ideas FOR UPDATE
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "ad ops can delete keyword ideas"
  ON public.kennel_keyword_ideas FOR DELETE
  USING (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_kki_updated_at
  BEFORE UPDATE ON public.kennel_keyword_ideas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.kennel_keyword_settings (
  platform text PRIMARY KEY CHECK (platform IN ('google','instacart')),
  engine_enabled boolean NOT NULL DEFAULT true,
  pause_threshold_cents int NOT NULL DEFAULT 2000,
  pause_zero_conv_days int NOT NULL DEFAULT 14,
  bid_raise_gate_pct int NOT NULL DEFAULT 25,
  max_daily_adds int NOT NULL DEFAULT 20,
  auto_apply boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.kennel_keyword_settings (platform) VALUES ('google'), ('instacart')
ON CONFLICT DO NOTHING;

ALTER TABLE public.kennel_keyword_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad ops can read keyword settings"
  ON public.kennel_keyword_settings FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "ad ops can update keyword settings"
  ON public.kennel_keyword_settings FOR UPDATE
  USING (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_kks_updated_at
  BEFORE UPDATE ON public.kennel_keyword_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
