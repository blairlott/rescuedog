-- ============================================================
-- PART 2.1 — cms_content scheduling + body_md
-- ============================================================
ALTER TABLE public.cms_content
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS body_md text;

ALTER TABLE public.cms_content
  DROP CONSTRAINT IF EXISTS cms_content_schedule_check;

ALTER TABLE public.cms_content
  ADD CONSTRAINT cms_content_schedule_check
    CHECK (start_at IS NULL OR end_at IS NULL OR start_at < end_at);

DROP POLICY IF EXISTS "Anyone can view cms content" ON public.cms_content;
DROP POLICY IF EXISTS "cms_content_public_read" ON public.cms_content;

CREATE POLICY "cms_content_public_read" ON public.cms_content
  FOR SELECT
  USING (
    (start_at IS NULL OR start_at <= now())
    AND (end_at IS NULL OR end_at > now())
  );

DROP POLICY IF EXISTS "cms_content_editor_read_all" ON public.cms_content;
CREATE POLICY "cms_content_editor_read_all" ON public.cms_content
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'brand_owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'cms_editor'::app_role)
  );

-- ============================================================
-- PART 2.2 — press_mentions
-- ============================================================
CREATE TABLE public.press_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_name text NOT NULL,
  outlet_slug text NOT NULL UNIQUE,
  logo_asset_slug text NOT NULL,
  article_url text,
  article_title text,
  display_order int NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'retired')),
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT press_mentions_schedule_check
    CHECK (start_at IS NULL OR end_at IS NULL OR start_at < end_at)
);

GRANT SELECT ON public.press_mentions TO anon, authenticated;
GRANT ALL ON public.press_mentions TO service_role;

ALTER TABLE public.press_mentions ENABLE ROW LEVEL SECURITY;

CREATE INDEX press_mentions_display_order_idx
  ON public.press_mentions (display_order)
  WHERE status = 'active';

CREATE TRIGGER press_mentions_set_updated_at
  BEFORE UPDATE ON public.press_mentions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "press_mentions_public_read" ON public.press_mentions
  FOR SELECT
  USING (
    status = 'active'
    AND (start_at IS NULL OR start_at <= now())
    AND (end_at IS NULL OR end_at > now())
  );

CREATE POLICY "press_mentions_brand_owner_write" ON public.press_mentions
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'brand_owner'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'brand_owner'::app_role)
  );

INSERT INTO public.press_mentions
  (outlet_name, outlet_slug, logo_asset_slug, display_order, status)
VALUES
  ('GMA3', 'gma3', 'gma3', 10, 'active'),
  ('Forbes', 'forbes', 'forbes', 20, 'active'),
  ('USA Today', 'usa-today', 'usa-today', 30, 'active'),
  ('Wine Enthusiast', 'wine-enthusiast', 'wine-enthusiast', 40, 'active'),
  ('SF Chronicle', 'sf-chronicle', 'sf-chronicle', 50, 'active'),
  ('Lodi Wine Commission', 'lodi-wine-commission', 'lodi-wine-commission', 60, 'active');
