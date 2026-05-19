
-- 1. app_settings: drop broad authenticated read
DROP POLICY IF EXISTS "settings_read_authed" ON public.app_settings;

-- 2. profiles: replace blanket read with self + admin
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()));

-- 3. autopilot_state: remove public read, restrict to staff
DROP POLICY IF EXISTS "Public reads autopilot state" ON public.autopilot_state;
CREATE POLICY "Staff reads autopilot state"
  ON public.autopilot_state FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()) OR public.is_cms_editor(auth.uid()));

-- 4. audit_log: restrict inserts to self or admins
DROP POLICY IF EXISTS "authenticated users can write audit log" ON public.audit_log;
CREATE POLICY "users insert own audit entries"
  ON public.audit_log FOR INSERT
  WITH CHECK (
    public.is_admin_or_owner(auth.uid())
    OR actor_user_id = auth.uid()
  );

-- 5. donation-documents storage: remove public read
DROP POLICY IF EXISTS "Public read for donation documents" ON storage.objects;
CREATE POLICY "Admins read donation documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'donation-documents'
    AND public.is_admin_or_owner(auth.uid())
  );

-- 6. realtime: remove sensitive ad tables from publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ad_recommendations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.ad_recommendations';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ad_execution_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.ad_execution_log';
  END IF;
END $$;
