-- Documentation: future video edits as additional bandit variants.
-- The Thompson-sampling bandit auto-tunes selection across all active rows
-- on a given surface. Lower the `weight` of underperformers via the admin
-- UI (Phase 3) or set `status='paused'` to remove from rotation WITHOUT
-- deleting accumulated conversion data. Image and video variants compete
-- directly in the same bandit by design.
--
-- Example: add a 30s cut as a new variant on the same surface.
--   INSERT INTO public.hero_variants
--     (surface, image_url, image_alt, variant_type, video_url,
--      eyebrow, headline_html, sub, cta_label, cta_href,
--      status, weight, variant_key)
--   VALUES
--     ('wine',
--      '/src/assets/hero/brand-video-30s-poster.jpg',
--      'Rescue Dog Wines brand story — 30s cut',
--      'video',
--      'https://www.youtube.com/embed/<VIDEO_ID>?autoplay=1&mute=1&loop=1&playlist=<VIDEO_ID>&controls=0&modestbranding=1&playsinline=1&rel=0',
--      'Lodi Cabernet · 50% of profits to rescue',
--      'Pour for<br/>the pack.',
--      'Award-winning, sustainably grown Lodi wines.',
--      'Shop Wines', '/wines',
--      'active', 1, 'home-brand-video-30s');

COMMENT ON TABLE public.hero_variants IS
'Hero rotation variants per surface (wine | merch). Thompson-sampling bandit auto-tunes selection across all status=active rows. To add a new video edit, INSERT a new row with variant_type=''video'' and a video_url (YouTube embed URL with loop params, or self-hosted MP4). Use unique variant_key for stable identification. Set status=''paused'' to remove from rotation without losing accumulated hero_events data. Image and video variants compete in the same bandit by design — let conversion data decide motion vs stillness.';

COMMENT ON COLUMN public.hero_variants.variant_type IS '''image'' (default) or ''video''. Video variants must populate video_url.';
COMMENT ON COLUMN public.hero_variants.video_url    IS 'YouTube embed URL (loop+autoplay params required) OR self-hosted MP4 URL. NULL for image variants.';
COMMENT ON COLUMN public.hero_variants.weight       IS 'Manual rotation weight. Bandit may override; admin UI exposes this for manual tuning of underperformers.';
COMMENT ON COLUMN public.hero_variants.variant_key  IS 'Optional stable handle for referencing a specific variant in code/seeds (e.g. ''home-brand-video''). Unique when set.';