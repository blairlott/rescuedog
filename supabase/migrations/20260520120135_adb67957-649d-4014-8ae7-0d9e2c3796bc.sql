
CREATE TABLE IF NOT EXISTS public.kennel_campaign_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  entity_id text NOT NULL,
  end_date date NOT NULL,
  label text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, entity_id)
);

ALTER TABLE public.kennel_campaign_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad ops read campaign windows"
  ON public.kennel_campaign_windows FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "ad ops insert campaign windows"
  ON public.kennel_campaign_windows FOR INSERT
  WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE POLICY "ad ops update campaign windows"
  ON public.kennel_campaign_windows FOR UPDATE
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "ad ops delete campaign windows"
  ON public.kennel_campaign_windows FOR DELETE
  USING (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_campaign_windows_updated_at
  BEFORE UPDATE ON public.kennel_campaign_windows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_campaign_windows_end ON public.kennel_campaign_windows (end_date);
