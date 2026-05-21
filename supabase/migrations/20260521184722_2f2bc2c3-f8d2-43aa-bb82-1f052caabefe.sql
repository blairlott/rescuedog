
CREATE TABLE public.dev_toggles (
  category text NOT NULL,
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (category, key)
);

ALTER TABLE public.dev_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read dev toggles"
  ON public.dev_toggles FOR SELECT
  USING (true);

CREATE POLICY "Admins can update dev toggles"
  ON public.dev_toggles FOR UPDATE
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Trigger: protect locked rows from being disabled or unlocked
CREATE OR REPLACE FUNCTION public.protect_locked_dev_toggles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.locked = true THEN
    IF NEW.enabled = false THEN
      RAISE EXCEPTION 'Cannot disable locked toggle %/%', OLD.category, OLD.key;
    END IF;
    IF NEW.locked = false THEN
      RAISE EXCEPTION 'Cannot unlock toggle %/%', OLD.category, OLD.key;
    END IF;
  END IF;
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_locked_dev_toggles
  BEFORE UPDATE ON public.dev_toggles
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_dev_toggles();

-- Seed: Account Features (all OFF, Subscribe & Save locked ON)
INSERT INTO public.dev_toggles (category, key, enabled, locked, label, description, sort_order) VALUES
  ('account_features', '__master__',         false, false, 'Enable all account features',           'Master toggle for the entire account features group', 0),
  ('account_features', 'login_register',     false, false, 'Login / Register',                      'Customer login and signup flows', 10),
  ('account_features', 'order_history',      false, false, 'Order History',                         'Past orders tab in the account area', 20),
  ('account_features', 'wine_club_portal',   false, false, 'Wine Club Portal',                      'Wine club management area', 30),
  ('account_features', 'loyalty_pack',       false, false, 'Loyalty / The Pack',                    'Loyalty points and Pack tier UI', 40),
  ('account_features', 'saved_addresses',    false, false, 'Saved Addresses',                       'Customer-managed address book', 50),
  ('account_features', 'referral_program',   false, false, 'Referral Program',                      'Customer referral links and rewards', 60),
  ('account_features', 'subscribe_and_save', true,  true,  'Subscribe & Save',                      'LOCKED ON — Subscribe & Save is required at all times', 5);

-- Seed: Customer Notifications (all OFF, S&S confirmation locked ON)
INSERT INTO public.dev_toggles (category, key, enabled, locked, label, description, sort_order) VALUES
  ('notifications', '__master__',                 false, false, 'Enable all customer email notifications', 'Master toggle for all outbound customer emails', 0),
  ('notifications', 'order_confirmation',         false, false, 'Order confirmation',                      'Sent after a successful order', 10),
  ('notifications', 'shipping_updates',           false, false, 'Shipping updates',                        'In-transit / delivered notifications', 20),
  ('notifications', 'wine_club_billing',          false, false, 'Wine club billing',                       'Upcoming charge / receipt for club shipments', 30),
  ('notifications', 'abandoned_cart',             false, false, 'Abandoned cart',                          'Cart recovery emails', 40),
  ('notifications', 'winback',                    false, false, 'Win-back',                                'Lapsed customer re-engagement', 50),
  ('notifications', 'post_purchase',              false, false, 'Post-purchase',                           'Review request / follow-up sequence', 60),
  ('notifications', 'welcome_series',             false, false, 'Welcome series',                          '5-step welcome onboarding emails', 70),
  ('notifications', 'subscribe_and_save_confirm', true,  true,  'Subscribe & Save confirmation',           'LOCKED ON — Subscribe & Save confirmation email always sends', 5);
