
CREATE TABLE public.media_buying_platforms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  website TEXT,
  signup_url TEXT,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','contacted','onboarding','seat_active','api_connected','paused','declined')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  rep_name TEXT,
  rep_email TEXT,
  rep_phone TEXT,
  monthly_budget_cents BIGINT,
  notes TEXT,
  last_contacted_at TIMESTAMPTZ,
  seat_activated_at TIMESTAMPTZ,
  api_connected_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mbp_category ON public.media_buying_platforms(category);
CREATE INDEX idx_mbp_status ON public.media_buying_platforms(status);

ALTER TABLE public.media_buying_platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ad ops can view platforms"
ON public.media_buying_platforms FOR SELECT
USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can insert platforms"
ON public.media_buying_platforms FOR INSERT
WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can update platforms"
ON public.media_buying_platforms FOR UPDATE
USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can delete platforms"
ON public.media_buying_platforms FOR DELETE
USING (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_mbp_updated_at
BEFORE UPDATE ON public.media_buying_platforms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Activity log
CREATE TABLE public.media_buying_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_id UUID NOT NULL REFERENCES public.media_buying_platforms(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('note','status_change','email_sent','document','call')),
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mba_platform ON public.media_buying_activity(platform_id, created_at DESC);

ALTER TABLE public.media_buying_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ad ops can view activity"
ON public.media_buying_activity FOR SELECT
USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can insert activity"
ON public.media_buying_activity FOR INSERT
WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can delete activity"
ON public.media_buying_activity FOR DELETE
USING (public.is_ad_ops(auth.uid()));

-- Seed platforms
INSERT INTO public.media_buying_platforms (slug, name, category, description, website, signup_url) VALUES
-- Programmatic DSPs
('trade_desk',     'The Trade Desk',         'Programmatic DSP', 'Premier independent DSP — display, video, CTV, audio, DOOH.', 'https://www.thetradedesk.com', 'https://www.thetradedesk.com/contact'),
('dv360',          'Google DV360',           'Programmatic DSP', 'Google Display & Video 360 enterprise DSP.', 'https://marketingplatform.google.com/about/display-video-360/', 'https://marketingplatform.google.com/about/display-video-360/contact-sales/'),
('yahoo_dsp',      'Yahoo DSP',              'Programmatic DSP', 'Omnichannel DSP across Yahoo properties + open web.', 'https://www.advertising.yahoo.com/dsp', 'https://www.advertising.yahoo.com/contact-us'),
('stackadapt',     'StackAdapt',             'Programmatic DSP', 'Self-serve multichannel DSP (display, native, video, CTV, DOOH, audio).', 'https://www.stackadapt.com', 'https://www.stackadapt.com/contact'),
('adroll',         'AdRoll',                 'Programmatic DSP', 'Retargeting + display for D2C brands.', 'https://www.adroll.com', 'https://www.adroll.com/contact-us'),
('simplifi',       'Simpli.fi',              'Programmatic DSP', 'Addressable + geo-fenced programmatic.', 'https://www.simpli.fi', 'https://www.simpli.fi/contact-us/'),
('basis',          'Basis (Centro)',         'Programmatic DSP', 'Full-stack DSP + DOOH + workflow.', 'https://basis.com', 'https://basis.com/contact'),
('viant',          'Viant',                  'Programmatic DSP', 'People-based DSP, strong on CTV.', 'https://www.viantinc.com', 'https://www.viantinc.com/contact-us/'),
('mediamath',      'MediaMath',              'Programmatic DSP', 'Independent omnichannel DSP.', 'https://www.mediamath.com', 'https://www.mediamath.com/contact/'),
-- Social
('meta_ads',       'Meta Ads',               'Social', 'Facebook + Instagram + Audience Network.', 'https://business.facebook.com', 'https://business.facebook.com/business/help'),
('tiktok_ads',     'TikTok Ads Manager',     'Social', 'TikTok in-feed, Spark Ads, TopView.', 'https://ads.tiktok.com', 'https://ads.tiktok.com/business/'),
('pinterest_ads',  'Pinterest Ads',          'Social', 'Pinterest promoted pins + shopping ads.', 'https://ads.pinterest.com', 'https://business.pinterest.com/advertise/'),
('snapchat_ads',   'Snapchat Ads',           'Social', 'Snap Ads, AR lenses, story ads.', 'https://ads.snapchat.com', 'https://forbusiness.snapchat.com/advertising'),
('linkedin_ads',   'LinkedIn Ads',           'Social', 'B2B targeting (helpful for wholesale).', 'https://business.linkedin.com/marketing-solutions/ads', 'https://business.linkedin.com/marketing-solutions/contact-us'),
('reddit_ads',     'Reddit Ads',             'Social', 'Subreddit-targeted promoted posts.', 'https://ads.reddit.com', 'https://ads.reddit.com'),
('x_ads',          'X (Twitter) Ads',        'Social', 'Promoted posts and trends.', 'https://ads.x.com', 'https://business.x.com/en/help/troubleshooting/how-twitter-ads-work.html'),
-- Search
('google_ads',     'Google Ads',             'Search', 'Search, Shopping, PMax, YouTube.', 'https://ads.google.com', 'https://ads.google.com'),
('microsoft_ads',  'Microsoft Advertising',  'Search', 'Bing + Yahoo + AOL search network.', 'https://ads.microsoft.com', 'https://ads.microsoft.com/cl/en-us'),
-- Retail Media
('amazon_ads',     'Amazon Ads',             'Retail Media', 'Sponsored Products/Brands/Display + DSP.', 'https://advertising.amazon.com', 'https://advertising.amazon.com/contact-sales'),
('instacart_ads_mb','Instacart Ads',         'Retail Media', 'Sponsored Product + display on Instacart.', 'https://www.instacartads.com', 'https://www.instacartads.com/contact-us'),
('carrot_ads',     'Carrot Ads',             'Retail Media', 'Independent grocer retail media network (Carrot Network).', 'https://www.carrot.com/ads', 'https://www.carrot.com/contact'),
('kroger_84_51',   'Kroger Precision (84.51°)','Retail Media', 'Kroger 1P data + on/off-site media.', 'https://www.8451.com', 'https://www.8451.com/contact'),
('albertsons_amc', 'Albertsons Media',       'Retail Media', 'Albertsons Media Collective.', 'https://www.albertsonsmediacollective.com', 'https://www.albertsonsmediacollective.com/contact'),
('roundel',        'Roundel (Target)',       'Retail Media', 'Target retail media network.', 'https://roundel.com', 'https://roundel.com/contact'),
('walmart_connect','Walmart Connect',        'Retail Media', 'Walmart retail media.', 'https://advertising.walmart.com', 'https://advertising.walmart.com/contact-us'),
('sams_map_mb',    'Sam''s Club MAP',        'Retail Media', 'Sam''s Club Member Access Platform.', 'https://samsclubmap.com', 'https://samsclubmap.com/contact-us'),
('criteo_rm',      'Criteo Retail Media',    'Retail Media', 'Network: Costco, Best Buy, Macy''s, Ulta…', 'https://www.criteo.com/products/commerce-media-platform/', 'https://www.criteo.com/contact-us/'),
-- CTV / Video
('mntn',           'MNTN',                   'CTV / Video', 'Performance CTV.', 'https://mountain.com', 'https://mountain.com/contact'),
('roku_ads',       'Roku Ads Manager',       'CTV / Video', 'Roku self-serve CTV.', 'https://advertising.roku.com', 'https://advertising.roku.com/contact'),
('samsung_ads',    'Samsung Ads',            'CTV / Video', 'Samsung Smart TV inventory.', 'https://www.samsungads.com', 'https://www.samsungads.com/contact-us'),
('hulu_disney',    'Disney/Hulu DRAX',       'CTV / Video', 'Disney Real-Time Ad Exchange.', 'https://www.disneyadvertising.com', 'https://www.disneyadvertising.com/contact/'),
('youtube_ads',    'YouTube Ads',            'CTV / Video', 'Bought via Google Ads / DV360.', 'https://www.youtube.com/ads', 'https://www.youtube.com/ads/'),
-- Audio
('spotify_ads',    'Spotify Ad Studio',      'Audio', 'Self-serve audio + podcast ads.', 'https://ads.spotify.com', 'https://ads.spotify.com'),
('pandora_siriusxm','SiriusXM Media (Pandora/SXM)','Audio', 'Streaming audio + podcast.', 'https://www.siriusxmmedia.com', 'https://www.siriusxmmedia.com/contact'),
('iheart_ads',     'iHeartMedia',            'Audio', 'Broadcast radio + podcast network.', 'https://advertising.iheart.com', 'https://advertising.iheart.com/contact'),
-- DOOH / Outdoor
('vistar_media',   'Vistar Media',           'DOOH / Outdoor', 'Programmatic DOOH SSP/DSP across screens.', 'https://www.vistarmedia.com', 'https://www.vistarmedia.com/contact'),
('place_exchange', 'Place Exchange',         'DOOH / Outdoor', 'DOOH SSP — billboards, transit, malls.', 'https://www.placeexchange.com', 'https://www.placeexchange.com/contact'),
('adquick',        'AdQuick',                'DOOH / Outdoor', 'Self-serve OOH marketplace.', 'https://www.adquick.com', 'https://www.adquick.com/contact'),
('billups',        'Billups',                'DOOH / Outdoor', 'Managed OOH agency + tech.', 'https://billups.com', 'https://billups.com/contact'),
('clear_channel',  'Clear Channel Outdoor',  'DOOH / Outdoor', 'Billboard + airport + transit.', 'https://clearchanneloutdoor.com', 'https://clearchanneloutdoor.com/contact-us/'),
('lamar',          'Lamar Advertising',      'DOOH / Outdoor', 'Largest US billboard network.', 'https://www.lamar.com', 'https://www.lamar.com/contact-us'),
('outfront',       'Outfront Media',         'DOOH / Outdoor', 'Billboards + transit (NYC subway).', 'https://www.outfrontmedia.com', 'https://www.outfrontmedia.com/contact-us'),
-- Affiliate / Influencer
('impact_com',     'impact.com',             'Affiliate', 'Affiliate + partnership management (already ambassadors).', 'https://impact.com', 'https://impact.com/contact-us/')
ON CONFLICT (slug) DO NOTHING;
