ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS pet_name TEXT,
  ADD COLUMN IF NOT EXISTS pet_birth_date DATE;