
ALTER TABLE public.dropship_partners
  ADD COLUMN IF NOT EXISTS fulfills_from_us boolean NOT NULL DEFAULT true;

ALTER TABLE public.marketplace_partner_applications
  ADD COLUMN IF NOT EXISTS fulfills_from_us boolean NOT NULL DEFAULT false;
