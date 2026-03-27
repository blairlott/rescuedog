
-- Wine Club Tiers
CREATE TABLE public.wine_club_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  frequency text NOT NULL,
  bottle_count int NOT NULL,
  wine_type text NOT NULL,
  price_cents int NOT NULL,
  description text,
  features text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Wine Club Memberships
CREATE TABLE public.wine_club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tier_id uuid REFERENCES public.wine_club_tiers(id) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  payment_status text NOT NULL DEFAULT 'simulated',
  shipping_address_line1 text,
  shipping_address_line2 text,
  shipping_city text,
  shipping_state text,
  shipping_zip text,
  gift_message text,
  is_gift boolean DEFAULT false,
  wine_preferences text[] DEFAULT '{}',
  next_shipment_date date,
  joined_at timestamptz DEFAULT now(),
  cancelled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Wine Club Shipments
CREATE TABLE public.wine_club_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid REFERENCES public.wine_club_memberships(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  shipment_date date,
  notification_sent_at timestamptz,
  customization_deadline timestamptz,
  tracking_number text,
  total_cents int DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Shipment Items
CREATE TABLE public.wine_club_shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES public.wine_club_shipments(id) ON DELETE CASCADE NOT NULL,
  product_handle text NOT NULL,
  product_title text NOT NULL,
  product_image_url text,
  variant_id text,
  price_cents int DEFAULT 0,
  quantity int DEFAULT 1,
  is_ai_suggested boolean DEFAULT false,
  is_customer_swap boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.wine_club_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wine_club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wine_club_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wine_club_shipment_items ENABLE ROW LEVEL SECURITY;

-- Tiers: public read
CREATE POLICY "Anyone can view active tiers" ON public.wine_club_tiers
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage tiers" ON public.wine_club_tiers
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Memberships
CREATE POLICY "Users can view own membership" ON public.wine_club_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can insert own membership" ON public.wine_club_memberships
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own membership" ON public.wine_club_memberships
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));

-- Shipments
CREATE POLICY "Users can view own shipments" ON public.wine_club_shipments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.wine_club_memberships m WHERE m.id = membership_id AND (m.user_id = auth.uid() OR public.is_admin_or_owner(auth.uid())))
  );

CREATE POLICY "Admins can manage shipments" ON public.wine_club_shipments
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Shipment Items
CREATE POLICY "Users can view own shipment items" ON public.wine_club_shipment_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wine_club_shipments s
      JOIN public.wine_club_memberships m ON m.id = s.membership_id
      WHERE s.id = shipment_id AND (m.user_id = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );

CREATE POLICY "Admins can manage shipment items" ON public.wine_club_shipment_items
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can customize own shipment items" ON public.wine_club_shipment_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wine_club_shipments s
      JOIN public.wine_club_memberships m ON m.id = s.membership_id
      WHERE s.id = shipment_id AND m.user_id = auth.uid() AND s.status = 'customer_notified'
    )
  );

-- Seed the 13 tiers
INSERT INTO public.wine_club_tiers (name, slug, frequency, bottle_count, wine_type, price_cents, description, sort_order) VALUES
  ('Monthly 6 Mixed Bottle Club', 'monthly-6-mixed', 'monthly', 6, 'mixed', 15000, 'Six hand-picked mixed bottles delivered monthly.', 1),
  ('Monthly 4 Mixed Bottles Club', 'monthly-4-mixed', 'monthly', 4, 'mixed', 10000, 'Four curated mixed bottles delivered monthly.', 2),
  ('Monthly 6 Bottle Red Wine Club', 'monthly-6-red', 'monthly', 6, 'red', 15000, 'Six premium red wines delivered monthly.', 3),
  ('Monthly 6 Bottle White & Sparkling Club', 'monthly-6-white', 'monthly', 6, 'white_sparkling', 15000, 'Six white and sparkling wines delivered monthly.', 4),
  ('Quarterly 4 Bottles of Red Club', 'quarterly-4-red', 'quarterly', 4, 'red', 10000, 'Four bold reds delivered every quarter.', 5),
  ('Quarterly 4 Mixed Bottle Club', 'quarterly-4-mixed', 'quarterly', 4, 'mixed', 10000, 'Four curated mixed bottles every quarter.', 6),
  ('Quarterly 4 Bottles of White & Sparkling Club', 'quarterly-4-white', 'quarterly', 4, 'white_sparkling', 10000, 'Four whites and sparklings every quarter.', 7),
  ('Quarterly 6 Mixed Bottle Club', 'quarterly-6-mixed', 'quarterly', 6, 'mixed', 15000, 'Six mixed bottles delivered quarterly.', 8),
  ('Quarterly 6 Bottle Club - White & Sparkling Only', 'quarterly-6-white', 'quarterly', 6, 'white_sparkling', 15000, 'Six whites and sparklings every quarter.', 9),
  ('Bi-Annual 6 Bottles of Red Club', 'biannual-6-red', 'bi-annual', 6, 'red', 15000, 'Six premium reds delivered twice a year.', 10),
  ('Yearly 12 Mixed Bottle Club', 'yearly-12-mixed', 'yearly', 12, 'mixed', 28000, 'Twelve curated mixed bottles annually.', 11),
  ('Yearly 12 Bottles of White & Sparkling Club', 'yearly-12-white', 'yearly', 12, 'white_sparkling', 28000, 'Twelve whites and sparklings annually.', 12),
  ('Yearly 12 Bottles of Red Club', 'yearly-12-red', 'yearly', 12, 'red', 28000, 'Twelve bold reds delivered annually.', 13);
