
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'sales_rep');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper: check if user is owner or admin
CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin')
  )
$$;

-- RLS policies on user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Owners and admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Owners and admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Owners and admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
