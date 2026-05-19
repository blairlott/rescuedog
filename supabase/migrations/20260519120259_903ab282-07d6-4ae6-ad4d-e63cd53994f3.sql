
-- 1. Lock down sales_accounts/sales_activities to sales team
DROP POLICY IF EXISTS "Authenticated users can insert accounts" ON public.sales_accounts;
DROP POLICY IF EXISTS "Authenticated users can update accounts" ON public.sales_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete accounts" ON public.sales_accounts;
CREATE POLICY "Sales team inserts accounts" ON public.sales_accounts
  FOR INSERT WITH CHECK (public.is_sales_team(auth.uid()));
CREATE POLICY "Sales team updates accounts" ON public.sales_accounts
  FOR UPDATE USING (public.is_sales_team(auth.uid()));
CREATE POLICY "Sales team deletes accounts" ON public.sales_accounts
  FOR DELETE USING (public.is_sales_team(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert activities" ON public.sales_activities;
DROP POLICY IF EXISTS "Authenticated users can update activities" ON public.sales_activities;
CREATE POLICY "Sales team inserts activities" ON public.sales_activities
  FOR INSERT WITH CHECK (public.is_sales_team(auth.uid()));
CREATE POLICY "Sales team updates activities" ON public.sales_activities
  FOR UPDATE USING (public.is_sales_team(auth.uid()));

-- 2. Fix mutable search_path on SECURITY DEFINER email queue helpers
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

-- 3. Remove broad list-all SELECT policies on public buckets.
-- Files remain publicly accessible via their public CDN URLs because
-- bucket.public = true; removing the policy only blocks LIST/enumeration.
DROP POLICY IF EXISTS "Ambassador avatars are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Public read blog-media" ON storage.objects;
DROP POLICY IF EXISTS "Public reads harvested media" ON storage.objects;
