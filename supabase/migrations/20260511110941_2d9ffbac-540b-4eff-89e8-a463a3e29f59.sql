
-- Add vendor_type + credentials + simulation flag to partners
ALTER TABLE public.dropship_partners
  ADD COLUMN IF NOT EXISTS vendor_type text NOT NULL DEFAULT 'partner_direct',
  ADD COLUMN IF NOT EXISTS vendor_credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS simulation_mode boolean NOT NULL DEFAULT true;

ALTER TABLE public.dropship_partners
  DROP CONSTRAINT IF EXISTS dropship_partners_vendor_type_check;
ALTER TABLE public.dropship_partners
  ADD CONSTRAINT dropship_partners_vendor_type_check
  CHECK (vendor_type IN ('vinoshipper_warehouse','printify','printful','gooten','partner_direct'));

-- Add fulfillment routing to skus
ALTER TABLE public.dropship_skus
  ADD COLUMN IF NOT EXISTS fulfillment_mode text NOT NULL DEFAULT 'partner_direct',
  ADD COLUMN IF NOT EXISTS vendor_product_id text,
  ADD COLUMN IF NOT EXISTS vendor_variant_id text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

ALTER TABLE public.dropship_skus
  DROP CONSTRAINT IF EXISTS dropship_skus_fulfillment_mode_check;
ALTER TABLE public.dropship_skus
  ADD CONSTRAINT dropship_skus_fulfillment_mode_check
  CHECK (fulfillment_mode IN ('vinoshipper_warehouse','printify','printful','gooten','partner_direct'));

-- Add vendor dispatch tracking to orders
ALTER TABLE public.dropship_orders
  ADD COLUMN IF NOT EXISTS vendor_order_id text,
  ADD COLUMN IF NOT EXISTS fulfillment_status_detail text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS simulated boolean NOT NULL DEFAULT false;

ALTER TABLE public.dropship_orders
  DROP CONSTRAINT IF EXISTS dropship_orders_fulfillment_status_detail_check;
ALTER TABLE public.dropship_orders
  ADD CONSTRAINT dropship_orders_fulfillment_status_detail_check
  CHECK (fulfillment_status_detail IN ('queued','dispatched','in_production','shipped','delivered','failed','cancelled'));

CREATE INDEX IF NOT EXISTS idx_dropship_skus_fulfillment_mode ON public.dropship_skus(fulfillment_mode);
CREATE INDEX IF NOT EXISTS idx_dropship_partners_vendor_type ON public.dropship_partners(vendor_type);
