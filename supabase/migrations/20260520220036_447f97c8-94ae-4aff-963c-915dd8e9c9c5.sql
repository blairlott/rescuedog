-- Legacy Vinoshipper members imported via CSV.
-- These are members who exist in Vinoshipper but haven't yet signed in to the app.
-- Once they create an account with a matching email, the row is "claimed" and
-- linked to a real wine_club_memberships row.

CREATE TABLE IF NOT EXISTS public.wine_club_legacy_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vinoshipper_customer_id text,
  vinoshipper_membership_id text,
  email text,
  first_name text,
  last_name text,
  phone text,
  club_name text,
  tier_id uuid REFERENCES public.wine_club_tiers(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('current', 'inactive', 'on_hold', 'archived')),
  shipping_address_line1 text,
  shipping_address_line2 text,
  shipping_city text,
  shipping_state text,
  shipping_zip text,
  shipping_country text,
  joined_at timestamptz,
  last_shipment_date date,
  next_shipment_date date,
  notes text,
  raw jsonb,
  source_file text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_membership_id uuid REFERENCES public.wine_club_memberships(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique on VS membership id (when present) so re-uploads upsert cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS wine_club_legacy_members_vs_membership_uniq
  ON public.wine_club_legacy_members (vinoshipper_membership_id)
  WHERE vinoshipper_membership_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wine_club_legacy_members_email
  ON public.wine_club_legacy_members (lower(email));
CREATE INDEX IF NOT EXISTS idx_wine_club_legacy_members_status
  ON public.wine_club_legacy_members (status);
CREATE INDEX IF NOT EXISTS idx_wine_club_legacy_members_tier
  ON public.wine_club_legacy_members (tier_id);

-- Timestamps
CREATE TRIGGER trg_wine_club_legacy_members_updated_at
  BEFORE UPDATE ON public.wine_club_legacy_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: only wine club managers (admins/owners) can read/write.
ALTER TABLE public.wine_club_legacy_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wine club managers can read legacy members"
  ON public.wine_club_legacy_members
  FOR SELECT
  TO authenticated
  USING (public.is_wine_club_manager(auth.uid()));

CREATE POLICY "Wine club managers can insert legacy members"
  ON public.wine_club_legacy_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_wine_club_manager(auth.uid()));

CREATE POLICY "Wine club managers can update legacy members"
  ON public.wine_club_legacy_members
  FOR UPDATE
  TO authenticated
  USING (public.is_wine_club_manager(auth.uid()))
  WITH CHECK (public.is_wine_club_manager(auth.uid()));

CREATE POLICY "Wine club managers can delete legacy members"
  ON public.wine_club_legacy_members
  FOR DELETE
  TO authenticated
  USING (public.is_wine_club_manager(auth.uid()));

-- Record of each import batch for audit/undo.
CREATE TABLE IF NOT EXISTS public.wine_club_legacy_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL,
  source_file text,
  rows_received integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  errors jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wine_club_legacy_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wine club managers can read import runs"
  ON public.wine_club_legacy_import_runs
  FOR SELECT
  TO authenticated
  USING (public.is_wine_club_manager(auth.uid()));

CREATE POLICY "Wine club managers can insert import runs"
  ON public.wine_club_legacy_import_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_wine_club_manager(auth.uid()));