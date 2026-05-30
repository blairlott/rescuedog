-- Add brand_owner enum value (role assignments come in PART 2.8)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'brand_owner';
