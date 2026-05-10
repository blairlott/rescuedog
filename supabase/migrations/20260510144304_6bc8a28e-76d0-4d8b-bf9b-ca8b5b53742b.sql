
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dropship_manager';
EXCEPTION WHEN others THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.is_dropship_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('owner','admin','dropship_manager')
  )
$$;

CREATE TABLE public.dropship_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  contact_email text,
  contact_phone text,
  api_base_url text,
  api_key_secret_name text,
  webhook_secret text,
  payout_terms text,
  notify_on_new_order boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dropship_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dropship managers manage partners" ON public.dropship_partners
  FOR ALL TO authenticated
  USING (public.is_dropship_manager(auth.uid()))
  WITH CHECK (public.is_dropship_manager(auth.uid()));

CREATE TABLE public.dropship_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.dropship_partners(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  partner_sku text,
  product_title text NOT NULL,
  product_image_url text,
  cost_cents integer NOT NULL DEFAULT 0,
  retail_cents integer NOT NULL DEFAULT 0,
  vinoshipper_product_id text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dropship_skus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dropship managers manage skus" ON public.dropship_skus
  FOR ALL TO authenticated
  USING (public.is_dropship_manager(auth.uid()))
  WITH CHECK (public.is_dropship_manager(auth.uid()));

CREATE TABLE public.dropship_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.dropship_partners(id),
  vinoshipper_order_id text,
  partner_order_id text,
  status text NOT NULL DEFAULT 'new',
  customer_name text,
  customer_email text,
  shipping_address jsonb,
  tracking_number text,
  tracking_url text,
  carrier text,
  subtotal_cents integer NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  notes text,
  submitted_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dropship_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dropship managers manage orders" ON public.dropship_orders
  FOR ALL TO authenticated
  USING (public.is_dropship_manager(auth.uid()))
  WITH CHECK (public.is_dropship_manager(auth.uid()));
CREATE INDEX idx_dropship_orders_partner ON public.dropship_orders(partner_id);
CREATE INDEX idx_dropship_orders_status ON public.dropship_orders(status);

CREATE TABLE public.dropship_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.dropship_orders(id) ON DELETE CASCADE,
  sku text NOT NULL,
  partner_sku text,
  product_title text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost_cents integer NOT NULL DEFAULT 0,
  unit_retail_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dropship_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dropship managers manage order items" ON public.dropship_order_items
  FOR ALL TO authenticated
  USING (public.is_dropship_manager(auth.uid()))
  WITH CHECK (public.is_dropship_manager(auth.uid()));

CREATE TABLE public.dropship_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.dropship_partners(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  order_count integer NOT NULL DEFAULT 0,
  total_cost_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  receipt_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dropship_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dropship managers manage payouts" ON public.dropship_payouts
  FOR ALL TO authenticated
  USING (public.is_dropship_manager(auth.uid()))
  WITH CHECK (public.is_dropship_manager(auth.uid()));

CREATE TABLE public.dropship_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.dropship_orders(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.dropship_partners(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  message text,
  payload jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dropship_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dropship managers view events" ON public.dropship_events
  FOR SELECT TO authenticated USING (public.is_dropship_manager(auth.uid()));
CREATE POLICY "Dropship managers insert events" ON public.dropship_events
  FOR INSERT TO authenticated WITH CHECK (public.is_dropship_manager(auth.uid()));

CREATE TRIGGER trg_dropship_partners_updated BEFORE UPDATE ON public.dropship_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dropship_skus_updated BEFORE UPDATE ON public.dropship_skus
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dropship_orders_updated BEFORE UPDATE ON public.dropship_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dropship_payouts_updated BEFORE UPDATE ON public.dropship_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
