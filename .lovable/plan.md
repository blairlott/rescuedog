# Wine Club & Subscribe-and-Save in Customer Profile

Make the Account page the single hub for all recurring-wine activity. Every action that touches shipments, billing, or stored cards goes through Vinoshipper using the `vinoshipper_customer_id` we now store on `customer_profiles`.

## Scope

Add four sub-areas under `/account`, all gated by the existing customer auth:

1. **Wine Club Membership** (existing club members)
2. **Subscribe & Save** (recurring single-SKU auto-ship)
3. **Gift Club Certificates** (purchase + print/download)
4. **Payment Methods** (Vinoshipper-stored cards, read-only mirror)

Tabs in the Account page: Profile · Wine Club · Subscriptions · Gifts · Payment · Orders · Favorites.

## 1. Wine Club Membership tab

Shows the member's current tier (Pup / Rescue / Pack), next ship date, ship-to address, and a tier-comparison panel.

Actions:
- **Switch club** — pick a new tier; confirm; calls `vinoshipper-update-membership` edge fn (PATCH membership tier on VS). Effective next billing cycle.
- **Pause** — 1, 2, or 3 cycles. Calls VS pause endpoint.
- **Cancel membership** — confirm dialog with retention copy; calls VS cancel endpoint; writes a `wine_club_events` row.
- **Update shipping address** — already supported; reuses VS address update.

Falls back to a "Join the Wine Club" CTA when the user has no active VS membership.

## 2. Subscribe & Save tab

Per-SKU recurring auto-ship for any wine in the catalog (separate from club tiers).

- List active subscriptions with SKU, qty, cadence (monthly / quarterly / biannual), next ship date, price.
- Edit qty / cadence / skip next / cancel.
- "Browse wines to subscribe" → product page gets a "Subscribe & Save 10%" toggle that, on add-to-cart, routes through Vinoshipper subscription creation rather than the one-time deep-link.
- Requires a stored payment method (see tab 4); if none, prompt user to add one first via the VS hosted card form.

New table `wine_subscriptions` mirrors the VS subscription IDs so we can render and manage from our UI without a round-trip on every page load.

## 3. Gift Club Certificates tab

- "Purchase a gift" form: tier, # of shipments, recipient name + email, optional personal note, delivery date.
- Calls `vinoshipper-create-gift` edge fn → returns a unique gift code + activation URL.
- Stores in new `gift_certificates` table (code, tier, shipments, recipient_email, redeemed_at, purchaser_id).
- "Print certificate" → opens a print-optimized React route `/account/gifts/:id/print` with branded PDF-ready layout (logo, code, redemption URL, expiry, note). Browser-native print.
- Email the recipient on the chosen delivery date via Resend (scheduled with `pg_cron` or sent immediately if delivery date is past).

## 4. Payment Methods tab

Cards live on Vinoshipper for PCI compliance — we never store PANs.
- "Add a card" → opens VS hosted iframe / redirect for tokenization.
- List existing cards (last4, brand, exp) fetched live via `vinoshipper-list-payment-methods` edge fn.
- Set default / remove.

## Data model additions

```text
wine_subscriptions
  id, user_id, vinoshipper_subscription_id (unique), sku, product_title,
  quantity, cadence, status (active|paused|cancelled),
  next_ship_date, unit_price_cents, created_at, updated_at

gift_certificates
  id, purchaser_user_id, vinoshipper_gift_id, code (unique), tier,
  shipments_count, total_cents, recipient_name, recipient_email,
  personal_note, deliver_on, sent_at, redeemed_at, redeemed_by_email,
  status (issued|delivered|redeemed|expired), created_at

wine_club_events
  id, user_id, event_type (joined|switched|paused|resumed|cancelled),
  from_tier, to_tier, vinoshipper_membership_id, metadata jsonb, created_at
```

All three: RLS — owner can SELECT/INSERT own rows; admins manage all.

## Edge functions (new / updated)

- `vinoshipper-get-membership` — returns current tier, status, next ship for the linked customer.
- `vinoshipper-update-membership` — switch tier, pause, resume, cancel.
- `vinoshipper-list-subscriptions` / `vinoshipper-create-subscription` / `vinoshipper-update-subscription`.
- `vinoshipper-list-payment-methods` / `vinoshipper-create-payment-session` (returns hosted form URL) / `vinoshipper-delete-payment-method`.
- `vinoshipper-create-gift` — creates a gift purchase on VS, returns code/URL.
- `send-gift-certificate-email` — Resend template; called immediately or via scheduled job.

All require the existing `VINOSHIPPER_API_KEY` runtime secret and use the `vinoshipper_customer_id` from `customer_profiles`.

## UI files to add / change

- `src/pages/AccountPage.tsx` — add tabs, route sub-paths.
- `src/components/account/WineClubTab.tsx`
- `src/components/account/SubscriptionsTab.tsx`
- `src/components/account/GiftsTab.tsx`
- `src/components/account/PaymentMethodsTab.tsx`
- `src/components/account/CancelMembershipDialog.tsx`, `SwitchTierDialog.tsx`, `PauseMembershipDialog.tsx`
- `src/pages/GiftCertificatePrintPage.tsx` + route in `App.tsx`
- Product detail page: add "Subscribe & Save" toggle.
- `src/integrations/supabase/types.ts` regenerates after migration.

## Out of scope

- Storing PANs in our DB (always Vinoshipper-tokenized).
- Building a full PDF generator — we use browser print-to-PDF with a styled route.
- Migrating existing manual subscribers; this only handles records created via the new flow.
- Wholesale/B2B subscriptions.

## Prerequisites / open items

1. **`VINOSHIPPER_API_KEY`** must be set (still pending from prior step). I will request it once you approve this plan if it isn't already configured.
2. Confirm Vinoshipper supports: tier switch on an active membership, hosted card iframe URL, gift certificate API. If any of these aren't exposed, we'll fall back to (a) email-to-staff workflow for switches/cancellations and (b) a Stripe-based card vault as a contingency — but only with your sign-off.

## Build order

1. Migration: 3 new tables + RLS.
2. Edge functions stubs returning typed responses (mock data when API key absent) so UI can be built/tested.
3. Account page tab refactor + Wine Club tab + Cancel/Switch/Pause flows.
4. Subscriptions tab + product page Subscribe & Save toggle.
5. Gifts tab + print route + Resend template.
6. Payment Methods tab.
7. Wire to live VS endpoints once API key + endpoint details confirmed.