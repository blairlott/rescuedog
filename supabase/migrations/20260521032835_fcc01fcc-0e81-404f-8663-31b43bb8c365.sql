UPDATE public.wine_club_tiers
SET discount_percent = 25, updated_at = now()
WHERE frequency = 'yearly' AND bottle_count >= 12;