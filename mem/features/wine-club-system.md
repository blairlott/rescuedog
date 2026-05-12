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
**Vinoshipper is the source of truth for club membership.** Anyone Vinoshipper identifies as an active club member automatically receives:
- **Flat 20% off** on EVERY order (club shipments + à la carte) — applied automatically by Vinoshipper, no coupon code UX in our app
- **Shipping included on regular cadence club shipments ONLY** (monthly/quarterly/bi-annual/yearly scheduled shipments)
- À la carte orders: 20% off applies, but **shipping is NOT included** — standard shipping rates apply
- Free to join, cancel/pause anytime (email info@rescuedogwines.com)
- Shipments fully customizable — members can add bottles, no max (subject to inventory)
- Gift memberships supported

## Discount enforcement
Vinoshipper owns membership lookup and discount application. Our app passes the customer's Vinoshipper customer ID with every order; Vinoshipper resolves member status and applies the 20% automatically. Our app only sets the shipping-included flag for scheduled cadence shipments — never for à la carte.

## Shipment timing
- Quarterly: timed around Valentine's Day, Mother's Day, end of summer, Thanksgiving
- Yearly: ships around Thanksgiving through ~Dec 14 for holiday delivery
- New holiday signups accepted through ~Dec 14

## Vinoshipper customer linking
Every Lovable Cloud customer account is auto-linked to a Vinoshipper customer record so wine shipments, age verification, and stored credit cards live on Vinoshipper.
- `customer_profiles.vinoshipper_customer_id` + `vinoshipper_linked_at` track the link.
- Edge function `vinoshipper-link-customer` is idempotent: short-circuits if already linked, else searches Vinoshipper by email and falls back to creating a new customer.
- Invoked automatically from `useCustomerAuth.onAuthStateChange` (once per session via `sessionStorage` flag); also exposed as a manual "Link Vinoshipper Account" button on the Account → Profile tab.
- `vinoshipper-create-membership` reuses the stored ID before creating a new VS customer, so club joins never duplicate.
- Requires the `VINOSHIPPER_API_KEY` runtime secret — without it the link call fails silently and login still works.
