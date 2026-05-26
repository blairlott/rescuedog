
-- Drop any permissive INSERT policies on pending_merch_handoffs and replace
-- with an authenticated-only owner-scoped policy.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pending_merch_handoffs'
      AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.pending_merch_handoffs', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated users insert own handoffs"
  ON public.pending_merch_handoffs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
