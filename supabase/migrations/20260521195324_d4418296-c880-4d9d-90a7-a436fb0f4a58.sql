-- 1. Add read-only `viewer` role to the app_role enum.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

-- 2. Pending role grants table.
CREATE TABLE IF NOT EXISTS public.pending_role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role app_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  applied_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text
);

CREATE UNIQUE INDEX IF NOT EXISTS pending_role_grants_email_role_unique
  ON public.pending_role_grants (lower(email), role);

CREATE INDEX IF NOT EXISTS idx_pending_role_grants_email_unapplied
  ON public.pending_role_grants (lower(email)) WHERE applied_at IS NULL;

ALTER TABLE public.pending_role_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners/admins manage pending grants"
  ON public.pending_role_grants
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));