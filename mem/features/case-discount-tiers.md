---
name: Case Discount Tiers
description: Public 10% case discount, Wine Club members get 20% — protects margin and makes membership valuable
type: feature
---

## Rule
- **Guests / non-members:** 10% off at full case (12 bottles). Stored in `cart_settings.thresholds.full_case_discount`.
- **Wine Club members:** 20% off at full case (and on all wine — comes from `wine_club_tiers.discount_percent`). Stored in `cart_settings.thresholds.club_discount` as the default fallback.

## Why
- DTC case-discount elasticity is low (~-0.3 to -0.5); 10% public rate keeps margin without meaningfully hurting velocity.
- 20% membership discount makes the Wine Club a real perk vs. a 10% pre-paid sampler tier.
- Avoids training guest buyers to wait for 20% off promos.

## How to apply
- `FreeShippingBar` and `CartUpsellBanner` read `useIsMember()` and show the member rate when applicable.
- Never hard-code 20% in case-discount copy — always derive from `useIsMember().discountPercent` for members or `fullCaseDiscount` for guests.
- The "Join the Club" cart teaser must show the *uplift* (`clubDiscount - fullCaseDiscount`), not the full club %, so guests see the true incremental value.
