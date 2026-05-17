
ALTER TABLE public.wine_club_memberships
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS grandfathered_discount_percent integer;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vinoshipper_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_vinoshipper_customer_id_idx
  ON public.profiles(vinoshipper_customer_id)
  WHERE vinoshipper_customer_id IS NOT NULL;

-- Idempotency for backfill: ensure each VS customer/membership maps to at most one row
CREATE UNIQUE INDEX IF NOT EXISTS wine_club_memberships_vs_membership_unique
  ON public.wine_club_memberships(vinoshipper_membership_id)
  WHERE vinoshipper_membership_id IS NOT NULL;

-- Track backfill runs for resumable pagination + observability
CREATE TABLE IF NOT EXISTS public.vinoshipper_backfill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('customers','memberships')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  cursor text,
  total_seen integer NOT NULL DEFAULT 0,
  total_linked integer NOT NULL DEFAULT 0,
  total_skipped integer NOT NULL DEFAULT 0,
  total_errors integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.vinoshipper_backfill_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view backfill runs"
  ON public.vinoshipper_backfill_runs FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can insert backfill runs"
  ON public.vinoshipper_backfill_runs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can update backfill runs"
  ON public.vinoshipper_backfill_runs FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
