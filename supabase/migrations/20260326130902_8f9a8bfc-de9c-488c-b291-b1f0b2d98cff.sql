
CREATE TABLE public.rescue_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rescue_partners ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Anyone can view rescue partners"
ON public.rescue_partners FOR SELECT
TO anon, authenticated
USING (true);

-- Only admins/owners can insert
CREATE POLICY "Admins can insert rescue partners"
ON public.rescue_partners FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Only admins/owners can update
CREATE POLICY "Admins can update rescue partners"
ON public.rescue_partners FOR UPDATE
TO authenticated
USING (public.is_admin_or_owner(auth.uid()));

-- Only admins/owners can delete
CREATE POLICY "Admins can delete rescue partners"
ON public.rescue_partners FOR DELETE
TO authenticated
USING (public.is_admin_or_owner(auth.uid()));
