
CREATE TABLE public.customer_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  display_name text,
  phone text,
  referral_code text UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  referred_by text,
  wine_preferences text[] DEFAULT '{}',
  birth_date date,
  email text
);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own customer profile"
  ON public.customer_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert own customer profile"
  ON public.customer_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own customer profile"
  ON public.customer_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE TABLE public.customer_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_handle text NOT NULL,
  product_title text NOT NULL,
  product_image_url text,
  product_price text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_handle)
);

ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favorites"
  ON public.customer_favorites FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own favorites"
  ON public.customer_favorites FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own favorites"
  ON public.customer_favorites FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
