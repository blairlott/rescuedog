---
name: Promo & Shipping Rules (legacy site canonical)
description: Promo codes, shipping fees, signup discount, and stacking rules from rescuedogwines.com
type: feature
---
Audited from rescuedogwines.com on 2026-05-10.

## Active promo codes
- STOCKUP: 20% off orders of 12+ bottles, mixed cases allowed, continental US only, may end at any time. NOT stackable with club member discount or bundle pricing.
- Email signup: subscribers receive a code for 10% off their next order (footer capture).

## Shipping (a la carte)
- Flat $9.99 on orders of 6+ bottles (continental US, where allowed).
- Under 6 bottles: standard variable shipping.
- Wine Club scheduled cadence shipments: shipping included (never "free").
- Mother's Day 6-Pack and similar curated bundles: shipping included.
- Shipments require adult signature 21+ with valid ID; UPS Access Point pickup supported at checkout.
- Failed delivery returns: refund wine cost only, shipping is non-refundable. UPS rerouting fee charged for in-flight address changes (route via customerservice@vinoshipper.com cc info@rescuedogwines.com).
- Extreme weather may delay shipments to protect product.

## Stacking rules
- Member 20% applies to every a la carte order automatically (Vinoshipper resolves member status; no code needed).
- **Yearly (case) club tier: 25% off scheduled shipments, 20% off à la carte.** Other tiers stay flat at their `discount_percent`. Stored on `wine_club_tiers.shipment_discount_percent` (falls back to `discount_percent` when null).
- The previous "+5% full-case bump on à la carte" model is RETIRED — yearly members get the 25% via their scheduled shipments instead, not by hitting a 12-bottle threshold in the cart.
- **Stackable promos:** seasonal/site-wide codes flagged `stacks_with_member_discount = true` may stack with member 20% — but **NEVER** with the case bump or with each other. Cart applies the better of (member+case) vs (member+code).
- **Non-stackable always:** Subscribe & Save (VS limitation), bundle pricing (already discounted), STOCKUP-style stockup codes, signup code.
- **Hard ceiling:** total stacked discount may not exceed 30% — cart logic clamps.
- When the promo-code system is built, every promo row needs `stacks_with_member_discount` boolean (default OFF) and `max_stacked_percent` (default 30) editable in admin.
