---
name: Shopify Merch Backend
description: Live Shopify Storefront API integration for the merch catalog and merch checkout
type: feature
---
The merch catalog is sourced live from Shopify (rescuedoggear store, public domain gear.rescuedog.com).

## Connected store
- Store admin: https://admin.shopify.com/store/rescuedoggear/
- Permanent domain: home-45-new-fashion.myshopify.com
- Storefront API version: 2025-07
- Storefront access token is hard-coded in `src/lib/shopify.ts` (publishable, safe to ship)

## Catalog flow
- `fetchMerchProducts()` calls Shopify Storefront API `products` query
- Adapter maps Shopify products → existing `ShopifyProduct` shape with `productKind: "merch"`
- Category chips on /merch are derived from Shopify productType + title heuristics (apparel, drinkware, pet, home)
- The Supabase `merch_products` table is no longer read by the storefront. Left in place but dormant.

## Cart / checkout (forked)
- Wine items: local-only; checkout deep-links to Vinoshipper (compliance + payment) — unchanged
- Merch items: mirrored to a real Shopify cart via `cartCreate` / `cartLinesAdd` / `cartLinesUpdate` / `cartLinesRemove`
- `useCartStore` exposes `getShopifyCheckoutUrl()` for merch handoff
- `CartDrawer` shows two checkout buttons when both kinds exist; the customer completes two transactions and is told so explicitly
- `useCartSync` calls `syncCart` on visibility change → polls Shopify cart; if it returns 0/missing the merch lines are dropped (handles post-checkout)

## CMS
- The "Merch Images" CMS tab is now a deprecation notice deep-linking to the Shopify admin

## Look & feel
- The current Lovable build is the source of truth for design
- Shopify is purely a product + checkout backend; we do not pull theme, layout, fonts, or styling from Shopify

## Catalogue plans
- Initial sync = the existing 21 SKUs in rescuedoggear
- Larger curation pass scheduled for later
