ALTER TABLE public.sales_accounts ADD COLUMN distributor_rep_email text DEFAULT NULL;
ALTER TABLE public.sales_accounts ADD COLUMN distributor_rep_phone text DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN phone text DEFAULT NULL;