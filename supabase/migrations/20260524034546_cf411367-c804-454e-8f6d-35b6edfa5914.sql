ALTER TABLE public.kennel_iab_segments DROP CONSTRAINT IF EXISTS kennel_iab_segments_tier_check;
ALTER TABLE public.kennel_iab_segments ADD CONSTRAINT kennel_iab_segments_tier_check CHECK (tier BETWEEN 1 AND 4);

INSERT INTO public.kennel_iab_segments (segment_id, segment_name, tier, rdw_mapping, platform_ids) VALUES
  ('IAB14-2-1', 'Dog Adoption', 3, 'dog_owner', '{"meta":"6003409023306","google":"/m/01h62y"}'::jsonb),
  ('IAB14-2-2', 'Dog Rescue', 3, 'dog_owner', '{"meta":"6003584260213","google":"/m/0g6h3"}'::jsonb),
  ('IAB14-2-3', 'Dog Training', 3, 'dog_owner', '{"meta":"6003348604972","google":"/m/02nqj4"}'::jsonb),
  ('IAB14-2-4', 'Dog Breeds', 3, 'dog_owner', '{"meta":"6003101472113","google":"/m/0bt9lr"}'::jsonb),
  ('IAB9-30-1', 'Red Wine', 3, 'wine_buyer', '{"meta":"6003456871981","google":"/m/06dh1"}'::jsonb),
  ('IAB9-30-2', 'White Wine', 3, 'wine_buyer', '{"meta":"6003277493571","google":"/m/0c2yh"}'::jsonb),
  ('IAB9-30-3', 'Rose Wine', 3, 'wine_buyer', '{"meta":"6003280837313","google":"/m/0g0ndj"}'::jsonb),
  ('IAB9-30-4', 'Sparkling Wine', 3, 'wine_buyer', '{"meta":"6003150156782","google":"/m/01nkt"}'::jsonb),
  ('IAB9-30-5', 'Wine Tasting', 3, 'wine_buyer', '{"meta":"6003397347688","google":"/m/0fkb5"}'::jsonb),
  ('IAB9-30-6', 'Wine Clubs', 3, 'wine_buyer', '{"meta":"6003277940202","google":"/m/0fz1k"}'::jsonb),
  ('IAB20-3-1', 'Holiday Gifts', 3, 'gift_giver', '{"meta":"6003020834693","google":"/m/03d54"}'::jsonb),
  ('IAB20-3-2', 'Corporate Gifts', 3, 'gift_giver', '{"meta":"6003348604812","google":"/m/0jrl5"}'::jsonb),
  ('IAB22-2', 'Animal Welfare', 2, 'donor_aligned', '{"meta":"6003629266583","google":"/m/02hrh1q"}'::jsonb),
  ('IAB22-2-1', 'Animal Rights', 3, 'donor_aligned', '{"meta":"6003193662619","google":"/m/02hrh1q"}'::jsonb),
  ('IAB22-2-2', 'Pet Adoption', 3, 'donor_aligned', '{"meta":"6003456634432","google":"/m/01h62y"}'::jsonb)
ON CONFLICT (segment_id) DO UPDATE
  SET segment_name = EXCLUDED.segment_name,
      tier = EXCLUDED.tier,
      rdw_mapping = EXCLUDED.rdw_mapping,
      platform_ids = EXCLUDED.platform_ids,
      updated_at = now();

CREATE OR REPLACE FUNCTION public.resolve_iab_platform_ids(
  _rdw_mapping text,
  _platform text DEFAULT 'meta'
)
RETURNS TABLE (segment_id text, segment_name text, tier int, platform_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.segment_id, s.segment_name, s.tier,
         (s.platform_ids ->> _platform) AS platform_id
  FROM public.kennel_iab_segments s
  WHERE s.rdw_mapping = _rdw_mapping
    AND (s.platform_ids ->> _platform) IS NOT NULL
  ORDER BY s.tier ASC, s.segment_id ASC;
$$;

UPDATE public.lindy_inbox
SET workflow_status = 'done',
    workflow_note = 'IAB taxonomy expanded: tier 3 long-tail segments for dog_owner/wine_buyer/gift_giver + donor_aligned vertical. resolve_iab_platform_ids() RPC available for Meta/Google ad-set targeting.',
    workflow_updated_at = now()
WHERE type = 'lovable_prompt'
  AND payload::text ILIKE '%IAB%taxonomy%'
  AND workflow_status = 'queued';