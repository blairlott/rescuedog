
CREATE TABLE IF NOT EXISTS public.vs_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vs_customer_id TEXT NOT NULL UNIQUE,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  business_name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT,
  is_club_member BOOLEAN NOT NULL DEFAULT false,
  club_name TEXT,
  vs_created_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vs_customers_email ON public.vs_customers (lower(email));
CREATE INDEX IF NOT EXISTS idx_vs_customers_state ON public.vs_customers (state);
CREATE INDEX IF NOT EXISTS idx_vs_customers_club ON public.vs_customers (is_club_member);
CREATE INDEX IF NOT EXISTS idx_vs_customers_last_synced ON public.vs_customers (last_synced_at DESC);

ALTER TABLE public.vs_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and owners can view vs_customers"
  ON public.vs_customers FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins and owners can insert vs_customers"
  ON public.vs_customers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins and owners can update vs_customers"
  ON public.vs_customers FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins and owners can delete vs_customers"
  ON public.vs_customers FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_vs_customers_updated_at
  BEFORE UPDATE ON public.vs_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.vs_customer_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  pages INTEGER NOT NULL DEFAULT 0,
  seen INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vs_sync_log_started ON public.vs_customer_sync_log (started_at DESC);

ALTER TABLE public.vs_customer_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and owners can view vs_customer_sync_log"
  ON public.vs_customer_sync_log FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins and owners can insert vs_customer_sync_log"
  ON public.vs_customer_sync_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins and owners can update vs_customer_sync_log"
  ON public.vs_customer_sync_log FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
