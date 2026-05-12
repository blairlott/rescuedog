---
name: Vinoshipper Discount Architecture
description: Vinoshipper enforces all discount math at checkout — our cart only previews and forwards codes; member 20% via VS customer group, guest 10% via promo code
type: feature
---

## Source of truth = Vinoshipper
The Vinoshipper Injector and our deep-link handoff both give VS full ownership of cart totals, tax, shipping, and the final charge. Anything we render in our cart is a **preview only** — VS recomputes everything at checkout against its own promo / customer-group rules. We can never enforce a discount client-side; if it's not configured in VS, it's not applied to the card.

## How each discount tier is delivered
| Tier | Audience | Mechanism in Vinoshipper |
|---|---|---|
| Member 20% off (all wine) | Wine Club members | **Customer Group** with permanent 20% discount. Members are tagged into the group via API by `vinoshipper-create-membership` edge fn. **No code required** — VS applies it automatically because the customer is identified. |
| Guest 10% case off (12+ bottles) | Non-members at full case | **Discount Code** (e.g. `CASE10`) configured in VS Marketing → Discount Codes with min-12-bottle rule. We surface the code in the cart and pass it to VS in the checkout payload / deep-link query string. VS validates the bottle count itself. |
| Shipping included @ 6+ bottles | All | Configured in VS shipping rules (we just message it). |

## CMS knobs (`cart_settings`)
- `vinoshipper.case_discount_code` — promo code string (e.g. `CASE10`). Empty = don't show / send.
- `vinoshipper.member_group_id` — VS Customer Group ID for members. Used by membership edge fn, not the cart UI.

## Frontend behavior
- `useCartSettings()` exposes `caseDiscountCode` and `memberGroupId`.
- `CartUpsellBanner` shows "We'll auto-apply code XXXX at checkout" only when: guest + non-joining + ≥ fullCaseCount + code is set.
- `VinoshipperCheckoutModal` includes `promo_code` in the simulated webhook payload and shows it in the checkout summary. When the real VS injector goes live, `promo_code` becomes a query param on the deep-link or a `Vinoshipper.applyCode()` call.
- Members never see the guest code — they get the higher 20% via group discount automatically.

## What we MUST NOT do
- Do not compute discounted totals on our side and expect VS to honor them — VS will recharge from its own rules.
- Do not show a discount in the cart that isn't backed by a real VS promo code or customer group.
- Do not stack the member group discount with the case promo code (VS rejects stacking by default; member rate is already higher).
