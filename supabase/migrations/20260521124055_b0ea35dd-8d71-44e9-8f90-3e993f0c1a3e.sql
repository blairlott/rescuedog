
CREATE TABLE public.creative_asset_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type TEXT NOT NULL CHECK (asset_type IN ('hero','pdp','banner','ad_creative')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','generating','ready','approved','rejected','live','error')),
  prompt TEXT NOT NULL,
  brand_lockup TEXT NOT NULL DEFAULT 'wine' CHECK (brand_lockup IN ('wine','merch')),
  aspect_ratio TEXT NOT NULL DEFAULT '1:1',
  generated_url TEXT,
  storage_path TEXT,
  target_slot TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_caq_status ON public.creative_asset_queue (status, created_at DESC);
CREATE INDEX idx_caq_requested_by ON public.creative_asset_queue (requested_by, created_at DESC);

ALTER TABLE public.creative_asset_queue ENABLE ROW LEVEL SECURITY;

-- View: cms editors + admins
CREATE POLICY "CMS team can view creative asset queue"
  ON public.creative_asset_queue FOR SELECT
  USING (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

-- Insert: cms editors + admins can queue generation requests
CREATE POLICY "CMS team can queue creative generations"
  ON public.creative_asset_queue FOR INSERT
  WITH CHECK (
    (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()))
    AND auth.uid() = requested_by
    AND status IN ('pending','generating')
  );

-- Update: only admin/owner (Blair) can approve/reject/publish; cms editors can only add notes on their own pending requests
CREATE POLICY "Admins can update creative asset queue"
  ON public.creative_asset_queue FOR UPDATE
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Delete: admins only
CREATE POLICY "Admins can delete creative asset queue"
  ON public.creative_asset_queue FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_caq_updated_at
  BEFORE UPDATE ON public.creative_asset_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies on existing creative-studio bucket for /creative-assets/ prefix
DO $$ BEGIN
  CREATE POLICY "CMS team can read creative-assets prefix"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'creative-studio'
      AND (storage.foldername(name))[1] = 'creative-assets'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
