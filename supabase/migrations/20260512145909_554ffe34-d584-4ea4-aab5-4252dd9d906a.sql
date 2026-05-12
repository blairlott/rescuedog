INSERT INTO public.merch_products (
  handle, title, description, image_url, gallery_urls,
  price_cents, category, tags, variants, options,
  is_active, is_featured, sort_order
)
SELECT
  lower(regexp_replace(s.sku, '[^a-zA-Z0-9]+', '-', 'g')) AS handle,
  s.product_title,
  COALESCE(s.long_description, s.short_description, s.product_title)
    || E'\n\n[CMS NOTE — sourcing] '
    || COALESCE(s.notes, 'Add sourcing instructions in the CMS.') AS description,
  s.product_image_url,
  CASE WHEN s.product_image_url IS NULL THEN ARRAY[]::text[]
       ELSE ARRAY[s.product_image_url] END,
  s.retail_cents,
  CASE WHEN s.category IN ('apparel','drinkware','home','pet','gift') THEN s.category ELSE 'apparel' END,
  ARRAY['curated','dropship', s.category]::text[],
  jsonb_build_array(jsonb_build_object(
    'sku', s.sku,
    'title', 'Default',
    'price_cents', s.retail_cents,
    'available', true,
    'options', '[]'::jsonb
  )),
  '[]'::jsonb,
  true,
  s.is_featured,
  100 + s.storefront_sort
FROM public.dropship_skus s
WHERE s.is_active = true
ON CONFLICT (handle) DO NOTHING;