---
name: Case Discount Tiers
description: Public 20% case discount (shipping included), Wine Club members get 25% on full case
type: feature
---

## Rule
- **Guests / non-members:** 20% off at full case (12 bottles), shipping included. Stored in `cart_settings.thresholds.full_case_discount`.
- **Wine Club members:** 25% off at full case (12 bottles). Stored in `cart_settings.thresholds.club_discount` as the default fallback. Members still get 20% off on all wine below case quantities via `wine_club_tiers.discount_percent`.

## Why
- DTC case-discount elasticity is low (~-0.3 to -0.5); 10% public rate keeps margin without meaningfully hurting velocity.
- 20% membership discount makes the Wine Club a real perk vs. a 10% pre-paid sampler tier.
- Avoids training guest buyers to wait for 20% off promos.

## How to apply
- `FreeShippingBar` and `CartUpsellBanner` read `useIsMember()` and show the member rate when applicable.
- Never hard-code 20% in case-discount copy — always derive from `useIsMember().discountPercent` for members or `fullCaseDiscount` for guests.
- The "Join the Club" cart teaser must show the *uplift* (`clubDiscount - fullCaseDiscount`), not the full club %, so guests see the true incremental value.
