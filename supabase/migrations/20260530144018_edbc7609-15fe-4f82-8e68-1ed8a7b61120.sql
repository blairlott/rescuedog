
-- PART 2.7 schema additions to press_mentions
ALTER TABLE public.press_mentions
  ADD COLUMN IF NOT EXISTS show_on_homepage boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_in_press_section boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pull_quote text,
  ADD COLUMN IF NOT EXISTS pull_quote_attribution text,
  ADD COLUMN IF NOT EXISTS pull_quote_show_on_homepage boolean NOT NULL DEFAULT true;

-- PART 2.8 — brand_owner_access_log
CREATE TABLE IF NOT EXISTS public.brand_owner_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('grant','revoke')),
  target_user_id uuid NOT NULL,
  target_email text,
  performed_by uuid NOT NULL,
  performed_by_email text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.brand_owner_access_log TO authenticated;
GRANT ALL ON public.brand_owner_access_log TO service_role;

ALTER TABLE public.brand_owner_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_owner_access_log_owner_read"
  ON public.brand_owner_access_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "brand_owner_access_log_owner_insert"
  ON public.brand_owner_access_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

CREATE INDEX IF NOT EXISTS brand_owner_access_log_created_at_idx
  ON public.brand_owner_access_log (created_at DESC);

-- Atomic grant: insert role row + audit log
CREATE OR REPLACE FUNCTION public.grant_brand_owner_access(_target_user_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _caller_email text;
  _target_email text;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'owner'::app_role) THEN
    RAISE EXCEPTION 'Only owners may grant brand_owner access';
  END IF;

  SELECT email INTO _caller_email FROM auth.users WHERE id = _caller;
  SELECT email INTO _target_email FROM auth.users WHERE id = _target_user_id;
  IF _target_email IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, 'brand_owner'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.brand_owner_access_log
    (action, target_user_id, target_email, performed_by, performed_by_email, note)
  VALUES ('grant', _target_user_id, _target_email, _caller, _caller_email, _note);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_brand_owner_access(_target_user_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _caller_email text;
  _target_email text;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'owner'::app_role) THEN
    RAISE EXCEPTION 'Only owners may revoke brand_owner access';
  END IF;

  SELECT email INTO _caller_email FROM auth.users WHERE id = _caller;
  SELECT email INTO _target_email FROM auth.users WHERE id = _target_user_id;

  DELETE FROM public.user_roles
   WHERE user_id = _target_user_id AND role = 'brand_owner'::app_role;

  INSERT INTO public.brand_owner_access_log
    (action, target_user_id, target_email, performed_by, performed_by_email, note)
  VALUES ('revoke', _target_user_id, _target_email, _caller, _caller_email, _note);
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_brand_owner_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_brand_owner_access(uuid, text) TO authenticated;

-- Helper RPC: list brand owners with email (owner-only, via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.list_brand_owners()
RETURNS TABLE(user_id uuid, email text, granted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Owner role required';
  END IF;
  RETURN QUERY
    SELECT ur.user_id, u.email::text, COALESCE(ur.created_at, NULL)::timestamptz
      FROM public.user_roles ur
      JOIN auth.users u ON u.id = ur.user_id
     WHERE ur.role = 'brand_owner'::app_role
     ORDER BY u.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_brand_owners() TO authenticated;

-- Helper RPC: find user by email (owner-only)
CREATE OR REPLACE FUNCTION public.find_user_by_email(_email text)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Owner role required';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text
      FROM auth.users u
     WHERE lower(u.email) = lower(_email)
     LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO authenticated;
