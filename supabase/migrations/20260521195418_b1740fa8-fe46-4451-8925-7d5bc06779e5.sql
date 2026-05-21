-- Helper: who counts as a backend viewer (read-only or above).
CREATE OR REPLACE FUNCTION public.is_backend_viewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('owner', 'admin', 'executive', 'viewer')
  )
$$;

-- Replace handle_new_user to also apply any pending role grants matched by email.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _full_name text;
  _grant record;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, _full_name);

  -- Apply any pending role grants for this email (case-insensitive).
  FOR _grant IN
    SELECT id, role FROM public.pending_role_grants
    WHERE lower(email) = lower(NEW.email) AND applied_at IS NULL
  LOOP
    BEGIN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, _grant.role)
      ON CONFLICT (user_id, role) DO NOTHING;

      UPDATE public.pending_role_grants
      SET applied_at = now(), applied_user_id = NEW.id
      WHERE id = _grant.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pending role grant apply failed for % role=%: %', NEW.email, _grant.role, SQLERRM;
    END;
  END LOOP;

  BEGIN
    PERFORM public.enqueue_welcome_series(NEW.id, NEW.email, NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'welcome series enqueue failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Pre-assign Jana and Mike as backend viewers.
INSERT INTO public.pending_role_grants (email, role, notes)
VALUES
  ('j.ritter@rescuedogwines.com', 'viewer', 'Granted by Blair 2026-05-21 — read-only backend access (all areas)'),
  ('mbell@rescuedogwines.com',    'viewer', 'Granted by Blair 2026-05-21 — read-only backend access (all areas)')
ON CONFLICT DO NOTHING;