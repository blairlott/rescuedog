-- Drop overly-permissive view policies
DROP POLICY IF EXISTS "Authenticated users can view all accounts" ON public.sales_accounts;
DROP POLICY IF EXISTS "Authenticated users can view activities" ON public.sales_activities;

-- Restrict sales_activities reads to sales team
CREATE POLICY "Sales team views activities"
ON public.sales_activities
FOR SELECT
TO authenticated
USING (public.is_sales_team(auth.uid()));

-- Tighten cart_abandonments UPDATE: must be authenticated AND own the row
DROP POLICY IF EXISTS "Owner can update own abandonment" ON public.cart_abandonments;
CREATE POLICY "Owner can update own abandonment"
ON public.cart_abandonments
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND user_id = auth.uid())
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Pin search_path on remaining trigger function
CREATE OR REPLACE FUNCTION public.check_max_favorite_rescues()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT count(*) FROM public.customer_favorite_rescues WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'Maximum of 5 favorite rescues allowed';
  END IF;
  RETURN NEW;
END;
$function$;