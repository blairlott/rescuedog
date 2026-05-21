-- Add must_change_password flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Assign viewer role to the new user
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'viewer'::app_role
FROM auth.users u
WHERE u.email = 'wgharrisiii@rescuedogwines.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Ensure profile exists for new user
INSERT INTO public.profiles (id, email, full_name, must_change_password)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', ''), TRUE
FROM auth.users u
WHERE u.email = 'wgharrisiii@rescuedogwines.com'
ON CONFLICT (id) DO UPDATE SET must_change_password = TRUE;

-- Flag the three seeded backend accounts to force password change on next login
UPDATE public.profiles
SET must_change_password = TRUE
WHERE email IN (
  'j.ritter@rescuedogwines.com',
  'mbell@rescuedogwines.com',
  'wgharrisiii@rescuedogwines.com'
);