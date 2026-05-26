
-- 1. Add 'developer' role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';

-- 2. is_owner helper (owner-only, distinct from admin)
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner')
$$;

-- 3. credential_grants table
CREATE TABLE public.credential_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL DEFAULT 'all',  -- 'all' or specific provider name
  can_write boolean NOT NULL DEFAULT false,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  note text,
  UNIQUE (user_id, scope)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credential_grants TO authenticated;
GRANT ALL ON public.credential_grants TO service_role;

ALTER TABLE public.credential_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage credential grants"
ON public.credential_grants FOR ALL TO authenticated
USING (public.is_owner(auth.uid()))
WITH CHECK (public.is_owner(auth.uid()));

CREATE POLICY "Users see their own grants"
ON public.credential_grants FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 4. Access helpers
CREATE OR REPLACE FUNCTION public.can_access_credential(_user_id uuid, _provider text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_owner(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.credential_grants
        WHERE user_id = _user_id
          AND (scope = 'all' OR scope = _provider)
          AND (expires_at IS NULL OR expires_at > now())
      )
$$;

CREATE OR REPLACE FUNCTION public.can_write_credential(_user_id uuid, _provider text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_owner(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.credential_grants
        WHERE user_id = _user_id
          AND can_write = true
          AND (scope = 'all' OR scope = _provider)
          AND (expires_at IS NULL OR expires_at > now())
      )
$$;

-- 5. Tighten integration_credentials RLS
DROP POLICY IF EXISTS "Admins can view integration credentials" ON public.integration_credentials;
DROP POLICY IF EXISTS "Admins can insert integration credentials" ON public.integration_credentials;
DROP POLICY IF EXISTS "Admins can update integration credentials" ON public.integration_credentials;
DROP POLICY IF EXISTS "Admins can delete integration credentials" ON public.integration_credentials;
DROP POLICY IF EXISTS "Admins manage integration credentials" ON public.integration_credentials;

CREATE POLICY "Owner or granted users view credentials"
ON public.integration_credentials FOR SELECT TO authenticated
USING (public.can_access_credential(auth.uid(), provider));

CREATE POLICY "Owner or granted writers insert credentials"
ON public.integration_credentials FOR INSERT TO authenticated
WITH CHECK (public.can_write_credential(auth.uid(), provider));

CREATE POLICY "Owner or granted writers update credentials"
ON public.integration_credentials FOR UPDATE TO authenticated
USING (public.can_write_credential(auth.uid(), provider))
WITH CHECK (public.can_write_credential(auth.uid(), provider));

CREATE POLICY "Owner or granted writers delete credentials"
ON public.integration_credentials FOR DELETE TO authenticated
USING (public.can_write_credential(auth.uid(), provider));
