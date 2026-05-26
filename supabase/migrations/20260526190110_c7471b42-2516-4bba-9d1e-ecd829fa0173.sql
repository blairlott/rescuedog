
-- 1. donation_requests: add admin SELECT
CREATE POLICY "Admins view donation requests"
  ON public.donation_requests FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

-- 2. wholesale_inquiries: add admin SELECT
CREATE POLICY "Admins view wholesale inquiries"
  ON public.wholesale_inquiries FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

-- 3. marketplace_partner_products: replace permissive insert
DROP POLICY IF EXISTS "Approved partners or anon can submit products"
  ON public.marketplace_partner_products;

CREATE POLICY "Submissions require staff or valid application"
  ON public.marketplace_partner_products FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    public.is_admin_or_owner(auth.uid())
    OR public.is_dropship_manager(auth.uid())
    OR (
      application_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.marketplace_partner_applications a
         WHERE a.id = application_id
      )
    )
  );
