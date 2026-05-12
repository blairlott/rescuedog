ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS vinoshipper_customer_id text,
  ADD COLUMN IF NOT EXISTS vinoshipper_linked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS customer_profiles_vinoshipper_customer_id_idx
  ON public.customer_profiles (vinoshipper_customer_id)
  WHERE vinoshipper_customer_id IS NOT NULL;