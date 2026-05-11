
ALTER TABLE public.dropship_skus
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS long_description text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'apparel',
  ADD COLUMN IF NOT EXISTS collection text,
  ADD COLUMN IF NOT EXISTS badges text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storefront_sort integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_curated_at timestamptz,
  ADD COLUMN IF NOT EXISTS mock_review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mock_star_rating numeric(2,1),
  ADD COLUMN IF NOT EXISTS gallery_urls text[] DEFAULT '{}';

ALTER TABLE public.dropship_skus
  DROP CONSTRAINT IF EXISTS dropship_skus_category_check;
ALTER TABLE public.dropship_skus
  ADD CONSTRAINT dropship_skus_category_check
  CHECK (category IN ('apparel','drinkware','accessories','stickers','home','pet','gift','other'));

CREATE INDEX IF NOT EXISTS idx_dropship_skus_category ON public.dropship_skus(category);
CREATE INDEX IF NOT EXISTS idx_dropship_skus_collection ON public.dropship_skus(collection);
CREATE INDEX IF NOT EXISTS idx_dropship_skus_featured ON public.dropship_skus(is_featured) WHERE is_featured = true;

-- Public storefront view — only active SKUs that have been curated (have a description)
CREATE OR REPLACE VIEW public.merch_storefront AS
SELECT
  s.id,
  s.sku,
  s.product_title,
  s.short_description,
  s.long_description,
  s.product_image_url,
  s.gallery_urls,
  s.retail_cents,
  s.category,
  s.collection,
  s.badges,
  s.is_featured,
  s.storefront_sort,
  s.mock_review_count,
  s.mock_star_rating,
  s.fulfillment_mode,
  p.name AS vendor_name,
  p.vendor_type
FROM public.dropship_skus s
JOIN public.dropship_partners p ON p.id = s.partner_id
WHERE s.is_active = true
  AND s.short_description IS NOT NULL
  AND p.status = 'active';

GRANT SELECT ON public.merch_storefront TO anon, authenticated;
