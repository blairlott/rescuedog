INSERT INTO public.press_mentions 
  (outlet_name, outlet_slug, logo_asset_slug, article_url, 
   article_title, display_order, status, show_on_homepage, 
   show_in_press_section, pull_quote, pull_quote_attribution, 
   pull_quote_show_on_homepage)
VALUES
  ('The Press Democrat', 'press-democrat', 'press-democrat',
   'https://www.pressdemocrat.com/2024/04/09/family-owned-napa-valley-wine-brand-is-all-about-mans-best-friend/',
   'Family-owned wine brand is all about man''s best friend — Kathryn Reed, The Press Democrat (April 2024)',
   25, 'paused', true, true,
   'Rescue Dog Wines has made dogs an equal partner in their business.',
   'Kathryn Reed, The Press Democrat', true),
  ('Nashville Scene', 'nashville-scene', 'nashville-scene',
   'https://www.nashvillescene.com/food_drink/bites/wine-wednesday-rescue-dog-wines/article_7906115a-a10f-11ef-893e-7bb72e17df02.html',
   'Wine Wednesday: Rescue Dog Wines — Chris Chamberlain, Nashville Scene (Nov 2024)',
   70, 'paused', true, true,
   'Rescue Dog Wines are better than Josh.',
   'Chris Chamberlain, Nashville Scene', true),
  ('This Dog''s Life', 'this-dogs-life', 'this-dogs-life',
   'https://www.thisdogslife.co/cheers-to-this-4-wines-that-donate-to-dog-shelters-and-rescues/',
   'Cheers to This: 4 Wineries That Donate to Dog Shelters and Rescues — Jillian Blume, This Dog''s Life',
   80, 'paused', true, true,
   'Make world-class wines from locally sourced Lodi AVA grapes.',
   'Jillian Blume, This Dog''s Life', true)
ON CONFLICT (outlet_slug) DO NOTHING;