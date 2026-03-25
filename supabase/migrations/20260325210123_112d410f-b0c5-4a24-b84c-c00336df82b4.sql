
-- Profiles table for sales reps
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text DEFAULT 'sales_rep',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sales accounts table
CREATE TABLE public.sales_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  rep_name text,
  account_name text NOT NULL,
  buyer_name text,
  buyer_title text,
  premise_type text DEFAULT 'off' CHECK (premise_type IN ('on', 'off')),
  status text DEFAULT 'prospect' CHECK (status IN ('prospect', 'active', 'won', 'lost')),
  distributor text,
  distributor_rep text,
  street_address text,
  city text,
  state text DEFAULT 'GA',
  zip text,
  phone text,
  email text,
  website text,
  latitude double precision,
  longitude double precision,
  sales_order text,
  notes text,
  priority_rank integer DEFAULT 0
);

ALTER TABLE public.sales_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all accounts" ON public.sales_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert accounts" ON public.sales_accounts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update accounts" ON public.sales_accounts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete accounts" ON public.sales_accounts FOR DELETE TO authenticated USING (true);

-- Sales activities table
CREATE TABLE public.sales_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  account_id uuid REFERENCES public.sales_accounts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  activity_type text DEFAULT 'note' CHECK (activity_type IN ('note', 'visit', 'call', 'email', 'order')),
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'
);

ALTER TABLE public.sales_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view activities" ON public.sales_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert activities" ON public.sales_activities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update activities" ON public.sales_activities FOR UPDATE TO authenticated USING (true);
