---
name: Post-Vinoshipper Go-Live Plan
description: Sequenced plan executed once real VS Account ID + API keys are in hand (after May 18). Covers product sync, SEO/GEO, ad/CAPI, Lindy.
type: feature
---

# Post-Vinoshipper Go-Live Plan

Order of operations once `VS_SIMULATION = false`, real Account ID set, and Injector script live.

## Phase 1 — Catalog sync (foundation for everything else)
1. Add `vinoshipper_product_id` metafield on every wine product in Shopify.
2. Create edge function `shopify-product-sync`:
   - Cron nightly (pg_cron) + Shopify webhooks `products/update`, `products/delete`, `inventory_levels/update`.
   - Mirrors title, handle, description (HTML), all image URLs, variant prices, inventory, tags, awards, vinoshipper_product_id, vendor, product_type into `product_cache` table.
3. Migration: `product_cache` table (id, handle PK, payload jsonb, updated_at) + RLS public read.
4. Use cache for: SSR meta, abandoned-cart recovery emails, AI curation prompts, CRM lookups, Google/Meta product feed.

## Phase 2 — SEO
1. Per-PDP JSON-LD: `Product` + `Offer` (member price as separate Offer when logged in member).
2. Edge-rendered `/sitemap.xml` (products, /club, /events, /locator, /rescue-partners, /shop).
3. Per-page `<title>` + meta desc templates; OG + Twitter card images (edge-rendered with price overlay).
4. 301 map for legacy `rescuedogwines.com` URLs (collect from old site sitemap on May 18).
5. Canonicals + robots.txt; ensure /merch and wine site never compete on identical content.

## Phase 3 — GEO / Local SEO
1. `LocalBusiness` JSON-LD per shippable state.
2. Programmatic "Wines that ship to {state}" landing pages from VS compliance map + sales_accounts.
3. IP-geo hint banner in header/cart with shipping-to-state compliance copy.
4. Geo-aware hero swap (GA vs out-of-state) via edge function reading Cloudflare/IP headers.

## Phase 4 — Ad optimization (Meta CAPI, Google Ads, GTM)
1. Add secrets: `META_CAPI_ACCESS_TOKEN`, `META_PIXEL_ID`, `GOOGLE_ADS_CONVERSION_ID`, `GTM_CONTAINER_ID`.
2. Edge function `meta-capi-relay` fires server-side events from VS webhooks: AddToCart, InitiateCheckout, Purchase, CompleteRegistration (club signup), Lead (donation/wholesale).
3. Google Ads enhanced conversions with SHA-256 hashed email from VS order webhook.
4. GTM container with dataLayer pushes from React: page_view, view_item, add_to_cart, begin_checkout, purchase, club_signup, club_tier_selected.
5. Generate Google Merchant + Meta Catalog feed at `/feeds/products.xml` and `/feeds/products.json` from product_cache.
6. UTM persistence: capture on landing, write to localStorage, attach to VS order webhook + referral_rewards row.

## Phase 5 — Lindy integration
**Outbound (do first, ~1 hour):**
1. Add secret `LINDY_WEBHOOK_URL`.
2. Edge function `lindy-event-relay` POSTs JSON on: order_placed, cart_abandoned (3 hr cron over cart_abandonments), club_signup, club_cancelled, referral_submitted, donation_request.
3. Include UTM, member status, LTV, product mix in payload.

**Inbound (Lindy → Lovable):**
1. Public endpoints already from feeds.
2. New endpoint `POST /functions/v1/lindy-control` with HMAC-signed payloads:
   - `promote_sku`: adds SKU to homepage hero band via cms_content.
   - `set_free_shipping_threshold`: updates cart_settings (per-region optional).
   - `pause_audience`: flips a feature flag in cms_content.
3. Audit log every Lindy mutation into `cms_content_history` (new table).

## Phase 6 — Cart-abandonment recovery (uses Phase 1 + Lindy)
1. Cron edge function `abandonment-recovery` runs every 30 min:
   - Finds `cart_abandonments` with status='opened' AND opened_at < now()-30min AND email not null.
   - Marks 'abandoned', sends Resend email with cart contents + checkout deep link.
   - Optionally pings Lindy for paid-retargeting audience.

## Phase 7 — Member experience polish
1. Real "Update payment method" deep link to VS hosted page (Injector callback).
2. Real "Cancel membership" via VS API + webhook back.
3. Apple/Google Pay enabled in VS Injector config (no code change beyond toggle).
4. Member-pricing on the Google Merchant feed via `<g:installment>` / dynamic price experiments.

## Secrets needed on May 18
- VS_ACCOUNT_ID (public, in code)
- VINOSHIPPER_API_KEY + VINOSHIPPER_API_SECRET (server)
- META_CAPI_ACCESS_TOKEN, META_PIXEL_ID
- GOOGLE_ADS_CONVERSION_ID, GOOGLE_ADS_CONVERSION_LABEL
- GTM_CONTAINER_ID (public)
- LINDY_WEBHOOK_URL (and HMAC secret if Lindy supports signing)

## Order to execute (estimated)
Day 1 AM: Phase 1 (sync) + add VS Account ID, flip simulation flag.
Day 1 PM: Phase 2 (SEO basics) + Phase 4 #1-4 (CAPI/GTM).
Day 2: Phase 3 (GEO) + Phase 4 #5-6 (feeds + UTM).
Day 3: Phase 5 (Lindy outbound + inbound) + Phase 6 (abandonment recovery).
Day 4: Phase 7 polish + QA on real iPhone.
