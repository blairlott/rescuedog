DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='integration_catalog') THEN
    DELETE FROM public.integration_catalog WHERE slug = 'carrot_ads';

    INSERT INTO public.integration_catalog (slug, name, category, description, docs_url, contact_url)
    VALUES
      ('swiftly_ads', 'Swiftly Ads', 'Retail Media',
       'Retail-media network powering independent and regional grocers. Complements Instacart for non-Instacart banners.',
       'https://www.swiftly.com/retail-media', 'https://www.swiftly.com/contact'),
      ('rosie_ads', 'Rosie Ads', 'Retail Media',
       'E-commerce and sponsored placements across the Rosie independent grocer network.',
       'https://www.rosieapp.com/', 'https://www.rosieapp.com/contact')
    ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          docs_url = EXCLUDED.docs_url,
          contact_url = EXCLUDED.contact_url;

    UPDATE public.integration_catalog
       SET description = 'Sponsored Product + display on the Instacart marketplace. See docs.instacart.com/ads — our Instacart rep can help wire this up.',
           docs_url = 'https://docs.instacart.com/ads/'
     WHERE slug = 'instacart_ads';
  END IF;
END$$;