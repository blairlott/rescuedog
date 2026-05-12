UPDATE public.merch_bundles
SET hero_image_url = 'https://images.unsplash.com/photo-1535930891776-0c2dfb7fda1a?w=1200'
WHERE handle = 'new-pup-welcome-kit';

UPDATE public.merch_products
SET image_url = 'https://images.unsplash.com/photo-1591946614720-90a587da4a36?w=600'
WHERE handle = 'rdw-dog-toy-rope';

UPDATE public.merch_products
SET image_url = 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600'
WHERE handle = 'rdw-apron';

UPDATE public.merch_products
SET image_url = 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600'
WHERE handle = 'rdw-socks';

DELETE FROM public.merch_products WHERE handle IN ('rdw-dog-collar-m','rdw-dog-collar-l');