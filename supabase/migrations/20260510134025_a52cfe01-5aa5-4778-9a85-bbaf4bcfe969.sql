ALTER TABLE public.wine_club_memberships
  ADD COLUMN IF NOT EXISTS vinoshipper_customer_id text,
  ADD COLUMN IF NOT EXISTS vinoshipper_membership_id text,
  ADD COLUMN IF NOT EXISTS is_legacy_member boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wine_club_memberships_vs_customer
  ON public.wine_club_memberships (vinoshipper_customer_id);
CREATE INDEX IF NOT EXISTS idx_wine_club_memberships_vs_membership
  ON public.wine_club_memberships (vinoshipper_membership_id);

ALTER TABLE public.wine_club_shipments
  ADD COLUMN IF NOT EXISTS vinoshipper_order_id text,
  ADD COLUMN IF NOT EXISTS vinoshipper_coupon_code text;

CREATE INDEX IF NOT EXISTS idx_wine_club_shipments_vs_order
  ON public.wine_club_shipments (vinoshipper_order_id);

ALTER TABLE public.wine_club_tiers
  ADD COLUMN IF NOT EXISTS vinoshipper_club_id text;