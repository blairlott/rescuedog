
CREATE TABLE public.subscription_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  subscription_type text NOT NULL DEFAULT 'curated_box',
  tier text,
  frequency text NOT NULL DEFAULT 'monthly',
  wine_preferences text[] DEFAULT '{}',
  product_handle text,
  product_title text,
  variant_id text,
  discount_percent integer NOT NULL DEFAULT 15,
  status text NOT NULL DEFAULT 'pending',
  notes text
);

ALTER TABLE public.subscription_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit subscription signups"
  ON public.subscription_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view subscription signups"
  ON public.subscription_signups
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
