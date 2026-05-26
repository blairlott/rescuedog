-- Remove the auto-generated wine hero variant whose stock image shows a non-Rescue-Dog label
UPDATE public.hero_variants
SET status = 'archived', updated_at = now()
WHERE id = '4fd346f2-64aa-4e9b-8de5-2aceb21b92b2';
