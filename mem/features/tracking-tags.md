---
name: Tracking & Ad Tags (legacy site canonical)
description: GTM, GA4, Meta Pixel/CAPI, and consent IDs ported from rescuedogwines.com to inherit on the new build
type: feature
---
Audited 2026-05-10 from rescuedogwines.com homepage HTML.

## Active IDs to port
- **Google Tag Manager container:** `GTM-NHTH66HM`
- **GA4 measurement ID:** `G-9WXP6SS770` (loaded directly via gtag.js, also likely fired through GTM)
- **Meta Pixel ID:** `1932984940325264`
- **Consent management:** Cookiebot (categories referenced: statistics, marketing)
- **reCAPTCHA:** present on forms (footer signup, club signup)

## Tag manager stack on legacy
- WordPress + Divi
- PixelYourSite plugin orchestrates Meta, GA, Google Ads, Pinterest, TikTok, Bing, LinkedIn — but ONLY Meta Pixel and GA4 IDs are actually configured in the live HTML. Other platforms are listed as "disabled_by_api" in the PYS config blob.
- No Google Ads (AW-) conversion tag detected
- No TikTok (ttq), Pinterest (pintrk), Bing (UET), LinkedIn Insight, Hotjar, Clarity, Klaviyo, or Attentive tags detected in HTML
- No server-side GTM (Stape) or Meta CAPI endpoint detected client-side; if CAPI is running it is via PixelYourSite Pro server-side - we should confirm with the client whether their PYS Pro license is sending CAPI events

## What to inherit on the new build
1. **GTM-NHTH66HM** loaded in `index.html` `<head>` + `<noscript>` iframe in `<body>` (NEVER inside `<head>` per project rule).
2. **GA4 G-9WXP6SS770** - configure inside GTM (preferred) so we don't double-fire alongside the existing gtag.js.
3. **Meta Pixel 1932984940325264** - load via GTM with consent gating; emit standard ecommerce events: `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`, plus `Lead` for club signup and newsletter.
4. **Meta Conversions API (CAPI)** - implement server-side from a Supabase edge function (event_name, event_id matched with browser pixel for dedup, hashed em/ph/fn/ln/zip, action_source=website, fbp/fbc cookies). Requires META_CAPI_ACCESS_TOKEN + META_PIXEL_ID secrets.
5. **Cookiebot** consent banner with same category mapping (statistics -> GA4, marketing -> Meta + future ad platforms). Requires COOKIEBOT_ID secret.
6. **reCAPTCHA v3** on club signup, donation, wholesale, contact, newsletter forms. Requires RECAPTCHA_SITE_KEY + RECAPTCHA_SECRET_KEY.

## Open questions for client
- Confirm Google Ads / Bing / TikTok / Pinterest accounts they want enabled (none active today).
- Confirm Meta CAPI is desired (legacy may already do this server-side via PixelYourSite Pro).
- Confirm Cookiebot domain group ID so we don't have to create a new one.

## Event taxonomy (target for new build, dataLayer-driven via GTM)
- page_view (auto)
- view_item (PDP)
- view_item_list (shop grid)
- select_item
- add_to_cart, remove_from_cart
- view_cart
- begin_checkout
- purchase (with transaction_id, value, currency, items[])
- generate_lead (club signup, newsletter, donation, wholesale)
- sign_up (customer account)
- login
