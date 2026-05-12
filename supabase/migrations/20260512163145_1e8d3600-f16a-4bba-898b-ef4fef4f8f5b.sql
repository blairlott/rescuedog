
DROP TABLE IF EXISTS public.vinoshipper_webhook_events;

DROP INDEX IF EXISTS public.idx_merch_products_vs_id;

ALTER TABLE public.merch_products
  DROP COLUMN IF EXISTS vinoshipper_product_id,
  DROP COLUMN IF EXISTS vinoshipper_synced_at;
