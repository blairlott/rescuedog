---
name: Subscribe & Save Architecture (Model B)
description: Self-driven recurring engine for S&S auto-ship; we own cron + cycles, Vinoshipper is the order sink via Stripe pm tokens
type: feature
---
**Model B — we own the scheduler, Vinoshipper is the order sink.**

## Tables
- `subscriptions` — one per enrollment. Status enum: pending_first_order|active|paused|past_due|canceled. Engine enum: self (default)|vinoshipper (fallback). Stores cadence_weeks, next_ship_date, vs_customer_id, vs_payment_method_token (Stripe pm_xxx), discount_code locked at signup, paused_until.
- `subscription_items` — SKU, qty, optional rotation_rule jsonb.
- `subscription_cycles` — one per ship attempt. Unique on (subscription_id, cycle_number) AND on idempotency_key. Status: pending|attempting|succeeded|failed|skipped. Tracks retry_count, next_retry_at, error_code, error_message, vs_order_id, frozen line_items snapshot.
- `subscription_events` — append-only audit trail (created|paused|resumed|skipped|payment_failed|payment_recovered|shipped|swapped|canceled|cadence_changed|address_changed|cycle_cancelled).
- `vinoshipper_webhook_events` — raw audit log with raw_body, signature_header, signature_valid, source_ip, related_subscription_id, related_cycle_id.

## Flow
- **First order**: browser → VS hosted page collects card → Stripe pm token attached to VS customer → webhook ORDER.CREATED + CUSTOMER.UPDATED → we persist vs_customer_id + vs_payment_method_token + first cycle row.
- **Recurring** (NOT YET BUILT, cron `subscription-run-cycles`): daily 06:00 ET, select subs where next_ship_date <= today AND status='active'. For each: POST /orders/checkcompliance → POST /orders {orderNumber=idempotency_key} → POST /orders/{id}/purchase {paymentMethodToken=pm_xxx}. On success: cycle 'succeeded', advance next_ship_date. On CARD_DECLINED webhook: cycle 'failed', sub 'past_due', schedule retry +3d.

## Vinoshipper API endpoints (confirmed)
- POST /api/v3/p/customers — create/find customer
- POST /api/v3/orders/checkcompliance — pre-flight
- POST /api/v3/orders — createOrder (caller-supplied orderNumber for idempotency)
- POST /api/v3/orders/{id}/purchase — charge using Stripe payment method token
- Webhooks: subjects ORDER|CUSTOMER|CLUB_MEMBERSHIP × events APPROVED|CREATED|UPDATED|CANCELLED|DELETED|CARD_DECLINED|TRACKING_NUMBER
- Native VS club endpoint available as fallback: POST /api/v3/p/customers/{id}/memberships (engine='vinoshipper')

## Current status
- ✅ Schema (subscriptions, subscription_items, subscription_cycles, subscription_events)
- ✅ Webhook handler (`vinoshipper-webhook`) extended: persists raw_body + signature + IP, routes ORDER events to BOTH wine_club_shipments AND subscription_cycles (both no-op cheaply if no match), updates sub status to past_due on CARD_DECLINED, recovers on APPROVED.
- ⏳ TODO: `subscription-prepare-first-order` edge fn (signed handoff token, creates VS customer)
- ⏳ TODO: `subscription-run-cycles` edge fn + pg_cron (daily recurring)
- ⏳ TODO: customer-facing S&S management UI (pause/skip/swap/cancel/change cadence)
- ⏳ TODO: confirm with VS exactly how Stripe pm_xxx token is returned after first-order card save (webhook payload vs GET /customers/{id}/payment-methods)

## Constraint
S&S and Wine Club / The Pack are SEPARATE products (see `subscribe-vs-club` memory). Never combine S&S discount with Pack member pricing. Never call S&S a "club".
