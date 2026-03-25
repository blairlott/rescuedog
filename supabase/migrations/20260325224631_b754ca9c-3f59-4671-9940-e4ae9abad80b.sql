ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- Approve all existing users
UPDATE public.profiles SET approved = true;