---
name: Case Discount Tiers
description: Guests get 10% on full cases. Wine Club members get 20% à la carte, 25% on yearly case shipment.
type: feature
---

## Rule (per Blair, confirmed)
- **Guests / non-members:** **10% off** at full case (12 bottles), shipping included. Stored in `cart_settings.thresholds.full_case_discount`. No à la carte discount.
- **Wine Club members (à la carte):** **20% off** every wine order, any quantity. Applied automatically by Vinoshipper at checkout when the member is logged into their **Vinoshipper** account (not our site).
- **Wine Club members (scheduled shipments):** **20% off** on all scheduled shipments **except** the annual full-case shipment, which is **25% off**. Stored as `cart_settings.thresholds.club_discount` (default 25) — represents the highest discount any member sees.

## Why
- Keeps the public case discount modest so the Wine Club has a real, ongoing perk (2× the public rate at full case, plus 20% on any size order).
- Avoids training guest buyers to wait for deep public promos.
- Authentication / discount application happens on Vinoshipper — our site only *displays* the member price as a passive teaser.

## How to apply
- `FreeShippingBar`, `CartUpsellBanner`, `CartDrawer` read `useIsMember()` and show the member rate when applicable.
- Never hard-code percentages in case-discount copy — derive from `useIsMember().discountPercent` (members) or `fullCaseDiscount` (guests).
- The "Join the Club" cart teaser shows the *uplift* (`clubDiscount − fullCaseDiscount`), not the full club %, so guests see the true incremental value.
- PDP / cart member-price badges are shown to **everyone** (passive teaser) — actual discount applies at Vinoshipper checkout after member login.
