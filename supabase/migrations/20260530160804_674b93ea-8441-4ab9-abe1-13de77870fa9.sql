UPDATE public.press_mentions
SET status = 'active', updated_at = now()
WHERE outlet_slug IN ('wine-enthusiast', 'nashville-scene');