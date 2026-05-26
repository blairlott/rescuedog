-- Allow sales team + backend viewers to read private sales_accounts rows.
-- Existing anon policy still exposes is_public=true rows; this layers on top.
CREATE POLICY "Sales team views all accounts"
ON public.sales_accounts
FOR SELECT
TO authenticated
USING (public.is_sales_team(auth.uid()) OR public.is_backend_viewer(auth.uid()));