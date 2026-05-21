-- Sweep every public-schema SELECT policy that already gates on a backend role
-- helper, and append "OR is_backend_viewer(auth.uid())" so the new read-only
-- `viewer` role (and executives) gain read access without any write privileges.
DO $$
DECLARE
  r record;
  new_qual text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'SELECT'
      AND qual IS NOT NULL
      AND qual !~* 'is_backend_viewer'
      AND qual ~* '(is_cms_editor|is_sales_team|can_view_kennel|is_wine_club_manager|is_dropship_manager|is_ambassador_manager|is_ad_ops|is_executive|is_admin_or_owner|is_brand_ambassador|has_role\()'
  LOOP
    new_qual := '(' || r.qual || ') OR public.is_backend_viewer(auth.uid())';
    BEGIN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s)',
        r.policyname, r.schemaname, r.tablename, new_qual
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip %.% / %: %', r.schemaname, r.tablename, r.policyname, SQLERRM;
    END;
  END LOOP;
END $$;