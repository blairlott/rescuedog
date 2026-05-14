ALTER TABLE public.rescue_partners
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS mission_blurb text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_focus boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_rescue_partners_focus_active
  ON public.rescue_partners (is_focus, is_active)
  WHERE is_focus = true AND is_active = true;