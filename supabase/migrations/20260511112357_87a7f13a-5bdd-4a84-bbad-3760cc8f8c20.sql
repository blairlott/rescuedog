
-- Self-managing merch curation queue
CREATE TABLE public.merch_curation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id uuid REFERENCES public.dropship_skus(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('remove_unavailable','replace_sku','adjust_price','add_recommendation','restock_alert','margin_warning')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','auto_applied')),
  reason text,
  ai_confidence numeric,
  current_snapshot jsonb DEFAULT '{}'::jsonb,
  proposed_change jsonb DEFAULT '{}'::jsonb,
  replacement_sku_id uuid REFERENCES public.dropship_skus(id) ON DELETE SET NULL,
  proposed_replacement jsonb,
  source text NOT NULL DEFAULT 'ai_scan',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_merch_curation_status ON public.merch_curation_actions(status, created_at DESC);
CREATE INDEX idx_merch_curation_sku ON public.merch_curation_actions(sku_id);

ALTER TABLE public.merch_curation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dropship managers manage curation actions"
ON public.merch_curation_actions FOR ALL TO authenticated
USING (public.is_dropship_manager(auth.uid()))
WITH CHECK (public.is_dropship_manager(auth.uid()));

CREATE TRIGGER update_merch_curation_updated_at
BEFORE UPDATE ON public.merch_curation_actions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-SKU margin policy & availability tracking
ALTER TABLE public.dropship_skus
  ADD COLUMN IF NOT EXISTS target_margin_percent integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS min_margin_percent integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS vendor_availability text NOT NULL DEFAULT 'in_stock' CHECK (vendor_availability IN ('in_stock','low_stock','out_of_stock','discontinued','unknown')),
  ADD COLUMN IF NOT EXISTS last_availability_check timestamptz,
  ADD COLUMN IF NOT EXISTS auto_curate boolean NOT NULL DEFAULT true;
