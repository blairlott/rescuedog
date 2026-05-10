# Project Memory

## Core
- Stack: Shopify for products/ecommerce, Supabase for backend/DB/CMS.
- ALL orders (à la carte + wine club) flow through Vinoshipper. No Stripe for wine.
- Wine club: 14 tiers, FREE to join, FLAT 20% off all orders (not tiered), cancel anytime.
- NEVER say "free shipping" — ALWAYS use "shipping included".
- Wine club: Vinoshipper identifies members and auto-applies 20% off everything. Shipping included on cadence shipments only — NOT à la carte.
- Wine club: 14 tiers, free to join. Members auto-get 20% off ALL orders. Shipping included on scheduled club shipments only — NOT on à la carte.
- Dual brand: high-def Rescue Dog logo/merch-only on /merch; Black RDW logo on wine site.
- Colors: Red #c30017, Black, Grey. Fonts: Nunito Sans, Avenir Next. Flat/sharp edges (border-radius: 0).
- Age gate required for wine routes; bypassed for /merch, /crm, /cms.

## Memories
- [Order Routing](mem://features/order-routing) — All orders flow through Vinoshipper including wine club
- [Shopify Integration](mem://tech/shopify) — Storefront API connection for products, cart, and checkout
- [CMS Strategy](mem://tech/cms-strategy) — Hybrid content management using Shopify and Supabase
- [CMS Image Storage](mem://tech/cms-image-storage) — CMS images stored in Shopify Files
- [Age Verification](mem://features/age-verification) — Modal gate for wine routes, bypassed for merch/crm/cms
- [Compliance](mem://features/compliance) — Age verification and Shopify wine compliance at checkout
- [Dual Site Branding](mem://features/branding) — Domain-specific branding (wine vs merch) and logos
- [Brand Guidelines](mem://style/brand) — Colors, fonts, and minimalist styling rules
- [Wine Sort Order](mem://features/wine-sort-order) — Strict product sorting sequence for the shop page
- [Award Badges](mem://features/award-badges) — Auto-styled product badges based on Shopify tags
- [Homepage Layout](mem://features/homepage-layout) — Specific section order for the homepage
- [Pricing Display](mem://features/pricing-display) — Wine Club Price and sampler disclaimer
- [Cart Marketing](mem://features/cart-marketing) — Shipping terminology and upsell rules
- [Subscriptions](mem://features/subscriptions) — Subscribe & Save and curated box tiers
- [Wine Club System](mem://features/wine-club-system) — 14 tiers, flat 20% off, signup UX + portal handing off to Vinoshipper
- [B2B Wholesale](mem://features/b2b-wholesale) — Region-based routing for wholesale inquiries
- [Donation Form](mem://features/donation-form) — 501(c) strict form with Resend email logic
- [CRM Core](mem://features/crm) — Sales CRM dashboard structure and features
- [CRM Access Management](mem://features/crm-auth) — Mandatory admin approval for CRM access
- [CRM Maps](mem://features/crm-maps) — Leaflet and Google Maps integration for CRM
- [CRM Staleness](mem://features/crm-staleness-tracking) — Activity tracking logic based on last order
- [Referral Rewards](mem://features/referral-rewards-logic) — Points-based system requiring manual CRM approval
- [Store Locator](mem://features/store-locator) — Grappos iframe integration for store locator
- [Wine Catalog Pricing](mem://pricing/wine-catalog) — Per-SKU retail and member prices ported from legacy site
- [Promo & Shipping Rules](mem://features/promo-rules) — STOCKUP, signup discount, $9.99 shipping at 6+, stacking rules
- [Legacy UX Inheritance](mem://features/legacy-ux-inheritance) — UX patterns from rescuedogwines.com worth porting
