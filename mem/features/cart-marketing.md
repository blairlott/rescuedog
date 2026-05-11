---
name: Cart Marketing
description: Shipping terminology, thresholds, and upsell rules for wine vs merch carts
type: feature
---

## Shipping terminology
NEVER say "free shipping". ALWAYS use "shipping included".

## Shipping-included thresholds
- **Wine routes:** 6+ bottles (unit-based — wine SKUs are price-uniform, $25–34).
- **Merch routes (`/merch`):** $150+ cart subtotal (dollar-based — merch SKUs vary widely from ~$15 stickers to $65 hoodies; dollar threshold protects margin and drives mixed-cart upsell).

Both thresholds are CMS-editable via `cart_settings` → `thresholds` (`free_shipping_bottles`, `merch_free_shipping_dollars`).

## Cart UX
- `FreeShippingBar` and `ShippingIncludedBanner` are mode-aware (`wine` | `merch`).
- Cart drawer corner ribbon shows progress: "{N} to unlock" (wine) or "${N} to unlock" (merch); flips to green "Shipping Included ✓" when met.
- Pre-selection banners sit above wine grids on home/shop/wines pages and above merch grid on merch home.
