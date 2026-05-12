
-- wine_subscriptions: per-SKU Subscribe & Save records mirrored from Vinoshipper
CREATE TABLE public.wine_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vinoshipper_subscription_id text UNIQUE,
  sku text NOT NULL,
  product_handle text,
  product_title text NOT NULL,
  product_image_url text,
  quantity integer NOT NULL DEFAULT 1,
  cadence text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'active',
  next_ship_date date,
  unit_price_cents integer NOT NULL DEFAULT 0,
  discount_percent integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wine_subscriptions_user ON public.wine_subscriptions(user_id);
ALTER TABLE public.wine_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions" ON public.wine_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin_or_owner(auth.uid()));
CREATE POLICY "Users insert own subscriptions" ON public.wine_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own subscriptions" ON public.wine_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR is_admin_or_owner(auth.uid()));
CREATE POLICY "Users delete own subscriptions" ON public.wine_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_wine_subscriptions_updated_at
  BEFORE UPDATE ON public.wine_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- gift_certificates: gift wine club purchases
CREATE TABLE public.gift_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchaser_user_id uuid NOT NULL,
  purchaser_email text,
  vinoshipper_gift_id text,
  code text NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  tier text NOT NULL,
  shipments_count integer NOT NULL DEFAULT 1,
  total_cents integer NOT NULL DEFAULT 0,
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  personal_note text,
  deliver_on date,
  sent_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by_email text,
  status text NOT NULL DEFAULT 'issued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gift_certificates_purchaser ON public.gift_certificates(purchaser_user_id);
CREATE INDEX idx_gift_certificates_recipient ON public.gift_certificates(recipient_email);
ALTER TABLE public.gift_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Purchaser views own gifts" ON public.gift_certificates
  FOR SELECT TO authenticated USING (purchaser_user_id = auth.uid() OR is_admin_or_owner(auth.uid()));
CREATE POLICY "Purchaser inserts own gifts" ON public.gift_certificates
  FOR INSERT TO authenticated WITH CHECK (purchaser_user_id = auth.uid());
CREATE POLICY "Admins update gifts" ON public.gift_certificates
  FOR UPDATE TO authenticated USING (is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_gift_certificates_updated_at
  BEFORE UPDATE ON public.gift_certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- wine_club_events: audit trail
CREATE TABLE public.wine_club_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  from_tier text,
  to_tier text,
  vinoshipper_membership_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wine_club_events_user ON public.wine_club_events(user_id);
ALTER TABLE public.wine_club_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own club events" ON public.wine_club_events
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin_or_owner(auth.uid()));
CREATE POLICY "Users insert own club events" ON public.wine_club_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR is_admin_or_owner(auth.uid()));
