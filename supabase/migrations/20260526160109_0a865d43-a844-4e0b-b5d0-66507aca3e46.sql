
-- customer_signals: admin/owner only
DROP POLICY IF EXISTS "customer_signals_select" ON public.customer_signals;
CREATE POLICY "customer_signals_admin_select"
  ON public.customer_signals FOR SELECT
  TO authenticated
  USING (is_admin_or_owner(auth.uid()));

-- customer_cohorts: admin/owner only
DROP POLICY IF EXISTS "cohort_read" ON public.customer_cohorts;
CREATE POLICY "cohort_admin_read"
  ON public.customer_cohorts FOR SELECT
  TO authenticated
  USING (is_admin_or_owner(auth.uid()));

-- dtc_historical_orders: admin/owner only for client-side reads
-- (edge functions use service_role and bypass RLS)
DROP POLICY IF EXISTS "Kennel viewers can read dtc_historical_orders" ON public.dtc_historical_orders;
DROP POLICY IF EXISTS "Ad ops can manage dtc_historical_orders" ON public.dtc_historical_orders;
CREATE POLICY "dtc_historical_orders_admin_select"
  ON public.dtc_historical_orders FOR SELECT
  TO authenticated
  USING (is_admin_or_owner(auth.uid()));
CREATE POLICY "dtc_historical_orders_admin_write"
  ON public.dtc_historical_orders FOR ALL
  TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));
