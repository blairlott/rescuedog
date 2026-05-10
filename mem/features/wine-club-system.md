---
name: Wine Club System
description: Custom wine club configurator + member portal handing off to Vinoshipper
type: feature
---
# Wine Club System

All wine club orders flow through Vinoshipper (see order-routing). Lovable app handles signup UX, member portal, and admin curation; Vinoshipper handles billing, age verification, tax, shipping.

## Tiers (14 total — match legacy rescuedogwines.com/club)
- **Monthly:** 4 Mixed, 6 Mixed, 6 Red, 6 White & Sparkling
- **Quarterly:** 4 Mixed, 4 Red, 4 White & Sparkling, 6 Mixed, 6 Red, 6 White & Sparkling
- **Bi-Annual:** 6 Red (2x yearly)
- **Yearly (Holiday, ships December):** 12 Mixed, 12 Red, 12 White & Sparkling

Each tier maps to a Vinoshipper club product via `wine_club_tiers.vinoshipper_club_id`.

## Member benefits — automatic on identification
Anyone identified as an active club member (by Vinoshipper customer ID match or membership lookup) automatically receives:
- **Flat 20% off** on EVERY order (club shipments + à la carte), no coupon code entry required
- **Shipping included on regular cadence club shipments ONLY** (monthly/quarterly/bi-annual/yearly scheduled shipments)
- À la carte orders: 20% off applies, but **shipping is NOT included** — standard shipping rates apply
- Free to join, cancel/pause anytime (email info@rescuedogwines.com)
- Shipments fully customizable — members can add bottles, no max (subject to inventory)
- Gift memberships supported

## Discount enforcement
Member status drives discount automatically. No promo codes shown to user. Implementation pushes the 20% as an order-level discount when creating Vinoshipper orders for identified members, and shipping=included flag only on scheduled club shipments.

## Shipment timing
- Quarterly: timed around Valentine's Day, Mother's Day, end of summer, Thanksgiving
- Yearly: ships around Thanksgiving through ~Dec 14 for holiday delivery
- New holiday signups accepted through ~Dec 14
