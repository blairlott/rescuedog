
-- Wine catalog (synced from Vinoshipper)
CREATE TABLE public.wine_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vinoshipper_product_id text UNIQUE,
  vinoshipper_sku text,
  handle text UNIQUE NOT NULL,
  title text NOT NULL,
  varietal text,
  vintage int,
  description text,
  tasting_notes text,
  image_url text,
  gallery_urls text[] DEFAULT '{}',
  price_cents int NOT NULL DEFAULT 0,
  club_price_cents int,
  badges text[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  in_stock boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  vinoshipper_cart_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wine_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active wines" ON public.wine_products
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage wines" ON public.wine_products
  FOR ALL TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_wine_products_updated_at
  BEFORE UPDATE ON public.wine_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Merch catalog (replaces Shopify for non-wine)
CREATE TABLE public.merch_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  description_html text,
  image_url text,
  gallery_urls text[] DEFAULT '{}',
  price_cents int NOT NULL DEFAULT 0,
  category text,
  collection text,
  tags text[] DEFAULT '{}',
  variants jsonb NOT NULL DEFAULT '[]',
  options jsonb NOT NULL DEFAULT '[]',
  inventory_qty int,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  legacy_shopify_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.merch_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active merch" ON public.merch_products
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage merch" ON public.merch_products
  FOR ALL TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_merch_products_updated_at
  BEFORE UPDATE ON public.merch_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_wine_products_sort ON public.wine_products(sort_order, title) WHERE is_active = true;
CREATE INDEX idx_merch_products_sort ON public.merch_products(sort_order, title) WHERE is_active = true;
