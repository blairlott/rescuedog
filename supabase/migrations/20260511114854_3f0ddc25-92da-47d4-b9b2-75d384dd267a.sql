CREATE POLICY "CMS editors manage content index"
ON public.content_index
FOR ALL
TO authenticated
USING (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()));