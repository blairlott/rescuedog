
-- 1. Origin tracking on memberships
ALTER TABLE public.wine_club_memberships
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'app_join',
  ADD COLUMN IF NOT EXISTS app_tier_config_id uuid REFERENCES public.wine_club_tiers(id),
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;

ALTER TABLE public.wine_club_memberships
  DROP CONSTRAINT IF EXISTS wine_club_memberships_origin_check;
ALTER TABLE public.wine_club_memberships
  ADD CONSTRAINT wine_club_memberships_origin_check
  CHECK (origin IN ('vinoshipper_legacy','app_join','app_curated_gift','admin_manual'));

-- Backfill: legacy flag wins; otherwise app_join with tier config = current tier
UPDATE public.wine_club_memberships
SET origin = 'vinoshipper_legacy'
WHERE is_legacy_member = true AND origin = 'app_join';

UPDATE public.wine_club_memberships
SET app_tier_config_id = tier_id
WHERE app_tier_config_id IS NULL AND origin <> 'vinoshipper_legacy';

CREATE INDEX IF NOT EXISTS idx_wine_club_memberships_origin
  ON public.wine_club_memberships(origin);

-- 2. Allow members to fully edit their own pending shipment items
DROP POLICY IF EXISTS "Users can customize own shipment items" ON public.wine_club_shipment_items;

CREATE POLICY "Members manage own pending shipment items - select"
ON public.wine_club_shipment_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.wine_club_shipments s
    JOIN public.wine_club_memberships m ON m.id = s.membership_id
    WHERE s.id = wine_club_shipment_items.shipment_id
      AND (m.user_id = auth.uid() OR is_admin_or_owner(auth.uid()))
  )
);

CREATE POLICY "Members manage own pending shipment items - insert"
ON public.wine_club_shipment_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.wine_club_shipments s
    JOIN public.wine_club_memberships m ON m.id = s.membership_id
    WHERE s.id = wine_club_shipment_items.shipment_id
      AND m.user_id = auth.uid()
      AND s.status NOT IN ('locked','shipped','cancelled')
      AND m.origin <> 'vinoshipper_legacy'
  )
);

CREATE POLICY "Members manage own pending shipment items - update"
ON public.wine_club_shipment_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.wine_club_shipments s
    JOIN public.wine_club_memberships m ON m.id = s.membership_id
    WHERE s.id = wine_club_shipment_items.shipment_id
      AND m.user_id = auth.uid()
      AND s.status NOT IN ('locked','shipped','cancelled')
      AND m.origin <> 'vinoshipper_legacy'
  )
);

CREATE POLICY "Members manage own pending shipment items - delete"
ON public.wine_club_shipment_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.wine_club_shipments s
    JOIN public.wine_club_memberships m ON m.id = s.membership_id
    WHERE s.id = wine_club_shipment_items.shipment_id
      AND m.user_id = auth.uid()
      AND s.status NOT IN ('locked','shipped','cancelled')
      AND m.origin <> 'vinoshipper_legacy'
  )
);

-- Also allow members to flip shipment status (customized / skip) on their own pending shipments
CREATE POLICY "Members update own pending shipment"
ON public.wine_club_shipments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.wine_club_memberships m
    WHERE m.id = wine_club_shipments.membership_id
      AND m.user_id = auth.uid()
      AND m.origin <> 'vinoshipper_legacy'
  )
  AND status NOT IN ('locked','shipped','cancelled')
);
