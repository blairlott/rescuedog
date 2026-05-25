DROP POLICY IF EXISTS "admins can view audit log" ON public.audit_log;
CREATE POLICY "admins can view audit log" ON public.audit_log FOR SELECT USING (is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS cohort_read ON public.customer_cohorts;
CREATE POLICY cohort_read ON public.customer_cohorts FOR SELECT USING (is_admin_or_owner(auth.uid()) OR is_executive(auth.uid()));

DROP POLICY IF EXISTS customer_signals_select ON public.customer_signals;
CREATE POLICY customer_signals_select ON public.customer_signals FOR SELECT USING (is_admin_or_owner(auth.uid()) OR is_wine_club_manager(auth.uid()));

DROP POLICY IF EXISTS "users can view own impact" ON public.impact_events;
CREATE POLICY "users can view own impact" ON public.impact_events FOR SELECT USING ((user_id = auth.uid()) OR is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Kennel viewers can read lookalike scores" ON public.kennel_lookalike_scores;
CREATE POLICY "Admins can read lookalike scores" ON public.kennel_lookalike_scores FOR SELECT USING (is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS reengage_log_admin_read ON public.reengagement_log;
CREATE POLICY reengage_log_admin_read ON public.reengagement_log FOR SELECT USING (is_admin_or_owner(auth.uid()) OR is_wine_club_manager(auth.uid()));

DROP POLICY IF EXISTS segflow_signals_select ON public.segflow_signals;
CREATE POLICY segflow_signals_select ON public.segflow_signals FOR SELECT USING (is_admin_or_owner(auth.uid()) OR is_wine_club_manager(auth.uid()));

DROP POLICY IF EXISTS kennel_carts_select ON public.vs_abandoned_carts;
CREATE POLICY admins_carts_select ON public.vs_abandoned_carts FOR SELECT USING (is_admin_or_owner(auth.uid()) OR is_wine_club_manager(auth.uid()));

DROP POLICY IF EXISTS kennel_tx_select ON public.vs_transactions;
CREATE POLICY admins_tx_select ON public.vs_transactions FOR SELECT USING (is_admin_or_owner(auth.uid()) OR is_wine_club_manager(auth.uid()));

DROP POLICY IF EXISTS anniversary_log_admin_read ON public.wine_club_anniversary_log;
CREATE POLICY anniversary_log_admin_read ON public.wine_club_anniversary_log FOR SELECT USING (is_admin_or_owner(auth.uid()) OR is_wine_club_manager(auth.uid()));