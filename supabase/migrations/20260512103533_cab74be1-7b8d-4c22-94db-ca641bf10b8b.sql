-- Add separate shipment-discount column for wine club tiers.
-- discount_percent continues to apply to à la carte purchases.
-- shipment_discount_percent applies to scheduled wine-club shipments;
-- when null, falls back to discount_percent.
ALTER TABLE public.wine_club_tiers
  ADD COLUMN IF NOT EXISTS shipment_discount_percent integer;

-- Yearly case tiers: 25% on regular shipments, 20% on à la carte.
UPDATE public.wine_club_tiers
SET discount_percent = 20,
    shipment_discount_percent = 25
WHERE frequency = 'yearly';