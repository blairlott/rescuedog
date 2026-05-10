---
name: Order Routing
description: All orders (à la carte AND wine club) must flow through Vinoshipper for checkout, payment, compliance, tax, and shipping.
type: feature
---
ALL orders flow through Vinoshipper — à la carte purchases, wine club shipments, gift memberships, recurring/subscription orders.

**Why:** Vinoshipper is wine-licensed in shipping states, owns compliance/age verification at checkout, tax, shipping labels, and recurring billing. Single source of truth for order state.

**How to apply:**
- Never propose Stripe, Shopify checkout, or any other payment processor for wine orders.
- Wine Club = configurator + member portal + admin curation only. Hands off to Vinoshipper for the transaction.
- Tier discounts (15–25%) are enforced via Vinoshipper promo codes, not in-app math.
- Our DB tracks intent/preferences/curation; Vinoshipper tracks the canonical order/payment/shipment state via webhooks.
- Shopify is for products catalog/merch only — not wine checkout.
