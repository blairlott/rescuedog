---
name: Wine Club System
description: Custom wine club configurator + member portal that hands off to Vinoshipper for billing/compliance/shipping
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

## Member benefits
- **Flat 20% off** all club shipments AND all à la carte orders, anytime (NOT tiered)
- **Shipping included** on regular club shipments (use "shipping included" — never "free shipping")
- **Free to join**, cancel/pause anytime (email info@rescuedogwines.com to pause/cancel)
- All shipments fully customizable — members can add bottles, no max (subject to inventory)
- Gift memberships supported

## Shipment timing
- Quarterly: timed around Valentine's Day, Mother's Day, end of summer, Thanksgiving
- Yearly: ships around Thanksgiving through ~Dec 14 for holiday delivery
- New holiday signups accepted through ~Dec 14

## FAQ canonical answers (from legacy page)
- Cost to join: free
- Shipping cost: included on regular shipments
- Cancel: anytime, email info@rescuedogwines.com
- Card update: at checkout after login or at vinoshipper.com
- Shipping rules vary by state (link to vinoshipper compliance article)
