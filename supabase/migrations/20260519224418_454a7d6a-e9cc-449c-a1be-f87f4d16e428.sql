DROP POLICY IF EXISTS "kennel operators can create soft signals" ON public.kennel_soft_signals;

CREATE POLICY "kennel operators can create soft signals"
  ON public.kennel_soft_signals FOR INSERT
  WITH CHECK (
    (public.is_ad_ops(auth.uid()) OR public.is_executive(auth.uid()))
    AND (created_by IS NULL OR created_by = auth.uid())
  );