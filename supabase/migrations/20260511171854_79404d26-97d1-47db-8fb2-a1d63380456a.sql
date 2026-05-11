-- 1. New role value
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ambassador_manager';

-- 2. Helper function
CREATE OR REPLACE FUNCTION public.is_ambassador_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('owner','admin','ambassador_manager')
  )
$$;

-- 3. Extend RLS so ambassador managers can manage ambassador data
DROP POLICY IF EXISTS "Ambassador managers manage profiles" ON public.ambassador_profiles;
CREATE POLICY "Ambassador managers manage profiles"
ON public.ambassador_profiles FOR ALL TO authenticated
USING (public.is_ambassador_manager(auth.uid()))
WITH CHECK (public.is_ambassador_manager(auth.uid()));

DROP POLICY IF EXISTS "Ambassador managers view health checks" ON public.impact_health_checks;
CREATE POLICY "Ambassador managers view health checks"
ON public.impact_health_checks FOR SELECT TO authenticated
USING (public.is_ambassador_manager(auth.uid()));

DROP POLICY IF EXISTS "Ambassador managers view events" ON public.ambassador_events;
CREATE POLICY "Ambassador managers view events"
ON public.ambassador_events FOR SELECT TO authenticated
USING (public.is_ambassador_manager(auth.uid()));

DROP POLICY IF EXISTS "Ambassador managers view rsvps" ON public.ambassador_event_rsvps;
CREATE POLICY "Ambassador managers view rsvps"
ON public.ambassador_event_rsvps FOR SELECT TO authenticated
USING (public.is_ambassador_manager(auth.uid()));