ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS hero_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hero_added_at timestamptz,
  ADD COLUMN IF NOT EXISTS hero_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS media_assets_hero_pool_idx
  ON public.media_assets (hero_eligible, status)
  WHERE hero_eligible = true AND status = 'approved';

CREATE OR REPLACE FUNCTION public.touch_hero_added_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.hero_eligible = true AND (OLD.hero_eligible IS DISTINCT FROM true) THEN
    NEW.hero_added_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_assets_hero_added_at ON public.media_assets;
CREATE TRIGGER trg_media_assets_hero_added_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.touch_hero_added_at();