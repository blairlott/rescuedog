CREATE TABLE IF NOT EXISTS public.merch_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text UNIQUE NOT NULL,
  title text NOT NULL,
  subtitle text,
  description text,
  hero_image_url text,
  sku_handles text[] NOT NULL DEFAULT '{}',
  bundle_price_cents integer NOT NULL DEFAULT 0,
  compare_at_cents integer,
  badge_label text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.merch_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active bundles"
  ON public.merch_bundles FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins manage bundles"
  ON public.merch_bundles FOR ALL TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_merch_bundles_updated
  BEFORE UPDATE ON public.merch_bundles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();