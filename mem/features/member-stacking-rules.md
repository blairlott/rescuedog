---
name: Member Discount Stacking Rules
description: Which promotions stack with the 20% wine club member discount
type: feature
---
Member 20% discount **stacks with**:
- Full-case discount (CMS-configurable %)
- Seasonal/site-wide promo codes — but ONLY when the promo is flagged stackable

Member 20% discount **does NOT stack with**:
- Subscribe & Save (recurring SKU discounts) — Vinoshipper limitation
- Bundle pricing (already discounted, excluded server-side)

When the promo-code system is built, every promo needs a `stacks_with_member_discount` boolean flag editable in the CMS/admin (default false). Cart logic must check this flag before combining with member pricing.
