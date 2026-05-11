
-- Marketplace partner applications (Amazon-style apply-to-sell)
CREATE TABLE public.marketplace_partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  website text,
  business_type text,
  ein_or_tax_id text,
  years_in_business integer,
  product_categories text[] DEFAULT '{}',
  product_description text NOT NULL,
  est_monthly_units integer,
  fulfillment_model text DEFAULT 'self_ship' CHECK (fulfillment_model IN ('self_ship','dropship','warehouse_to_vinoshipper','print_on_demand')),
  shipping_regions text[] DEFAULT '{}',
  sample_product_urls text[] DEFAULT '{}',
  social_links jsonb DEFAULT '{}'::jsonb,
  brand_story text,
  why_partner text,
  agreed_to_terms boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected','needs_info')),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_partner_id uuid REFERENCES public.dropship_partners(id) ON DELETE SET NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mp_apps_status ON public.marketplace_partner_applications(status, created_at DESC);

ALTER TABLE public.marketplace_partner_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a marketplace application"
ON public.marketplace_partner_applications FOR INSERT TO anon, authenticated
WITH CHECK (agreed_to_terms = true);

CREATE POLICY "Admins view marketplace applications"
ON public.marketplace_partner_applications FOR SELECT TO authenticated
USING (public.is_admin_or_owner(auth.uid()) OR public.is_dropship_manager(auth.uid()));

CREATE POLICY "Admins update marketplace applications"
ON public.marketplace_partner_applications FOR UPDATE TO authenticated
USING (public.is_admin_or_owner(auth.uid()) OR public.is_dropship_manager(auth.uid()))
WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.is_dropship_manager(auth.uid()));

CREATE TRIGGER update_mp_apps_updated_at
BEFORE UPDATE ON public.marketplace_partner_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-product submissions from approved partners (admin must approve each)
CREATE TABLE public.marketplace_partner_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.dropship_partners(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.marketplace_partner_applications(id) ON DELETE SET NULL,
  submitted_by_email text,
  product_title text NOT NULL,
  product_description text,
  category text,
  proposed_sku text,
  proposed_retail_cents integer NOT NULL DEFAULT 0,
  partner_cost_cents integer NOT NULL DEFAULT 0,
  product_image_url text,
  gallery_urls text[] DEFAULT '{}',
  variants jsonb DEFAULT '[]'::jsonb,
  fulfillment_mode text NOT NULL DEFAULT 'partner_direct',
  shipping_lead_time_days integer,
  inventory_qty integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','needs_info','live')),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  promoted_sku_id uuid REFERENCES public.dropship_skus(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mp_products_status ON public.marketplace_partner_products(status, created_at DESC);
CREATE INDEX idx_mp_products_partner ON public.marketplace_partner_products(partner_id);

ALTER TABLE public.marketplace_partner_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved partners or anon can submit products"
ON public.marketplace_partner_products FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins view marketplace products"
ON public.marketplace_partner_products FOR SELECT TO authenticated
USING (public.is_admin_or_owner(auth.uid()) OR public.is_dropship_manager(auth.uid()));

CREATE POLICY "Admins manage marketplace products"
ON public.marketplace_partner_products FOR UPDATE TO authenticated
USING (public.is_admin_or_owner(auth.uid()) OR public.is_dropship_manager(auth.uid()))
WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.is_dropship_manager(auth.uid()));

CREATE POLICY "Admins delete marketplace products"
ON public.marketplace_partner_products FOR DELETE TO authenticated
USING (public.is_admin_or_owner(auth.uid()) OR public.is_dropship_manager(auth.uid()));

CREATE TRIGGER update_mp_products_updated_at
BEFORE UPDATE ON public.marketplace_partner_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
