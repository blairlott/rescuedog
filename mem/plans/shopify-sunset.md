---
name: Shopify Sunset Plan
description: How and when Shopify is removed. Wine fully on Vinoshipper; merch via VS + drop-ship bridge.
type: feature
---

# Shopify Sunset Plan

## Decision
Shopify is being retired. Vinoshipper owns ALL checkout (wine + merch) once the drop-ship bridge ships.

## Current state (today)
- Wine cart routes through simulated VS overlay (already built).
- Shopify still wired for `/merch` checkout. Code remains behind `MERCH_BACKEND` flag in `src/lib/wordpressConfig.ts`.
- WP simulation layer in place; live URL needed before flip.

## Phase A — Wine on VS (May 18)
- Real VS Account ID + Injector script (see post-vs-golive plan).

## Phase B — Merch on Vinoshipper + drop-ship bridge
1. Create non-wine SKUs in VS producer console (glassware, hats, tees, gift sets).
   - VS supports merchandise items; Stripe-via-VS processes the card.
2. New edge function `vs-dropship-bridge` (cron + on-webhook):
   - Subscribes to VS `order.created` webhook.
   - Filters line items tagged `dropship: true` (custom field on SKU).
   - Forwards to fulfillment partner API (Printful / Printify / Sticker Mule):
     - POST order with shipping address + variant ID mapping.
     - Stores partner order ID on `vinoshipper_webhook_logs` row.
   - Polls partner for tracking number → updates VS order via VS API.
3. Drop `MERCH_BACKEND` flag from `'shopify'` → `'vinoshipper'`.
4. Disconnect Shopify store and delete: `src/lib/shopify.ts`, `src/components/cart/CartRecommendations.tsx` Shopify deps, all `shopify--*` references.

## Phase C — Decommission
- Remove Shopify connector entirely.
- Remove `useCartSync` Shopify-specific paths.
- Update memory: deprecate `mem://tech/shopify` and `mem://features/branding` Shopify mentions.

## Required for Phase B
- Vinoshipper API key + secret (already on the May-18 list).
- Fulfillment partner API key (Printful API key is most common — single secret `PRINTFUL_API_KEY`).
- SKU map: each VS dropship SKU → partner variant ID (stored in a small `dropship_sku_map` table).
