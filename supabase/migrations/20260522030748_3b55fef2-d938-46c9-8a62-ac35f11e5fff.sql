
-- 1. dropship_partners: split ALL into write-only for managers; SELECT admin/owner only
DROP POLICY IF EXISTS "Dropship managers manage partners" ON public.dropship_partners;

CREATE POLICY "Admins view dropship partners"
ON public.dropship_partners FOR SELECT TO authenticated
USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Dropship managers insert partners"
ON public.dropship_partners FOR INSERT TO authenticated
WITH CHECK (public.is_dropship_manager(auth.uid()));

CREATE POLICY "Dropship managers update partners"
ON public.dropship_partners FOR UPDATE TO authenticated
USING (public.is_dropship_manager(auth.uid()))
WITH CHECK (public.is_dropship_manager(auth.uid()));

CREATE POLICY "Dropship managers delete partners"
ON public.dropship_partners FOR DELETE TO authenticated
USING (public.is_dropship_manager(auth.uid()));

-- 2. integration_credentials: tighten SELECT to admin/owner only
DROP POLICY IF EXISTS "Admins can view integration credentials" ON public.integration_credentials;
CREATE POLICY "Admins can view integration credentials"
ON public.integration_credentials FOR SELECT TO authenticated
USING (public.is_admin_or_owner(auth.uid()));

-- 3. personalization_segments: remove anon write access
DROP POLICY IF EXISTS "segments anyone update" ON public.personalization_segments;
DROP POLICY IF EXISTS "segments anyone upsert" ON public.personalization_segments;

CREATE POLICY "segments admin upsert"
ON public.personalization_segments FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.is_cms_editor(auth.uid()));

CREATE POLICY "segments admin update"
ON public.personalization_segments FOR UPDATE TO authenticated
USING (public.is_admin_or_owner(auth.uid()) OR public.is_cms_editor(auth.uid()))
WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.is_cms_editor(auth.uid()));

-- 4. discount_redemptions: restrict INSERT to owner or service role
DROP POLICY IF EXISTS "Service role inserts redemptions" ON public.discount_redemptions;
CREATE POLICY "Users insert own redemptions"
ON public.discount_redemptions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
