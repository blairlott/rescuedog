---
name: Final Stack
description: Canonical platform stack — Vinoshipper for ecommerce/compliance, WP for content, Lovable Cloud for app/CRM/AI. Shopify is sunset.
type: constraint
---
**SHOPIFY IS SUNSET.** Do not build new Shopify integrations. Existing Shopify code is for migration/wind-down only.

**Final stack:**

| Layer | Tool | Role |
|---|---|---|
| Ecommerce, cart, checkout, wine compliance, customer support, shipping | **Vinoshipper** | System of record for orders, age/ID compliance, state-by-state shipping rules, customer service |
| App / CRM / locator / gaps / dashboards / AI / impact ledger / partner portal | **Lovable Cloud** (Supabase + edge functions + Lovable AI Gateway) | Source of truth for everything non-transactional |
| Marketing / blog / press / editorial | **Cloudways WordPress** | Content only; read-only consumer of Supabase data |
| HITL automation, scrapes, Slack approvals | **Lindy** (read-only) | Reads Supabase; writes only to `lindy_inbox` |
| Email | **Mailchimp** (Mandrill later) | All sends call `getCompliantRetailerSet()` for tied-house |
| Geocoding | **Nominatim** | Locator + gaps |

**Vinoshipper integration pattern:**
- Vinoshipper owns: products, pricing, cart, checkout, taxes, shipping rules, state compliance, age verification at purchase, refunds, customer support tickets, order history.
- Lovable Cloud consumes Vinoshipper via webhooks → writes to `orders`, `order_lines`, `customers_synced` tables for CRM, impact ledger, signal engine, depletions matching.
- Lovable Cloud never re-implements compliance — Vinoshipper is the legal shield.
- Wine club: Vinoshipper handles billing + shipment compliance; Lovable Cloud handles member experience (preferences, skip, swap, rescue selection, dashboard, referrals, points).

**Sunset:**
- ❌ Shopify (ecommerce → Vinoshipper)
- ❌ Grappos iframe (locator → native)
- ❌ Custom wine club replacing Vinoshipper — REVERSED, Vinoshipper stays for billing/compliance

**Rule of thumb:** if it touches money, alcohol shipping, or age verification → Vinoshipper. Everything else → Lovable Cloud.
