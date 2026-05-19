## Goal

Rescue Dog Wines sends its own branded order/shipment emails because Vinoshipper doesn't email buyers or recipients for a la carte or club orders. We'll trigger off a Vinoshipper webhook and send via Lovable Cloud's email queue.

## Scope (confirmed)

- **Gift recipient** notices ("a gift is on the way") — for a la carte AND wine club gift purchases.
- **Trigger**: Vinoshipper webhook (`order.created` for the "on the way" tease, `order.shipped` for tracking).
- **Wine club shipment notice** with tasting notes for the wines in that shipment.

Out of scope for now (can add later): buyer-side order confirmation and buyer shipped notification.

## Build phases

### 1. Gift Mode UX (frontend)

- Restore the recipient email + gift message fields in `CartGiftMode` (we hid them earlier) but only show them when Gift Mode is on.
- Add a "Send a gift" toggle in the Wine Club signup + member portal so club members can flag a shipment as a gift and provide recipient name/email/message + gift duration (one-time gift vs ongoing).
- Persist gift metadata to a new `wine_orders_meta` table keyed by Vinoshipper order ID (or club subscription ID) so the webhook handler can look it up when VS pings us.

### 2. Database

New tables (with RLS):
- `wine_order_gift_meta` — `vs_order_id` (unique), `buyer_user_id`, `recipient_name`, `recipient_email`, `gift_message`, `gift_wrap`, `source` (`a_la_carte` | `club`), created_at.
- `club_gift_subscriptions` — `subscription_id`, `recipient_name`, `recipient_email`, `gift_message`, `duration_months`, `started_at`.
- `vs_webhook_events` — raw webhook audit log: `event_id`, `event_type`, `vs_order_id`, `payload jsonb`, `processed_at`, `status`.

### 3. Vinoshipper integration

- Edge function `vinoshipper-webhook` — verifies the VS HMAC signature, dedupes by `event_id`, dispatches by `event_type` (`order.created`, `order.shipped`).
- Edge function `vinoshipper-order-lookup` — fetches order details (line items, tracking, recipient address) via VS REST API when payload is sparse.
- Map VS line items to our `wine_products` to enrich emails with tasting notes / pairings (already in CMS).
- Add `VINOSHIPPER_WEBHOOK_SECRET` secret for HMAC verification (request from user when ready to enable).

### 4. Email templates (Lovable Cloud)

Set up email infrastructure (if not already), then scaffold templates:
- `gift-incoming` — "A gift from {buyer_name} is on the way" — sent on `order.created` for gift orders.
- `gift-shipped` — "Your gift from {buyer_name} just shipped" — tracking link, ETA, adult-signature note.
- `club-shipment-shipped` — "Your {month} club shipment is on the way" — bottle list with tasting notes + pairings, tracking link.
- `club-gift-shipment-shipped` — gift-recipient variant of the club shipment email.

All templates branded (Red `#c30017`, Nunito Sans, RDW logo, flat edges), white email body background, no quantified impact, "shipping included" wording, no marketing.

### 5. CMS controls

Add panels under CMS → Settings:
- **Order Emails** — per-template enable/disable toggle and "Send test to my email" button (admins only).
- Editable subject lines + preview of `templateData` per template.

### 6. Wiring

- Webhook URL exposed: `https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/vinoshipper-webhook` — user pastes into VS producer settings.
- Webhook events log surfaced at `/cms/order-emails` with status (sent / failed / suppressed) for visibility.

## What I need from you to start

1. **Confirm I should provision Lovable Cloud Emails** (or you already have an email sender domain) — we need a verified sender domain so recipients see emails from `notify@rescuedogwines.com` rather than a Lovable default.
2. **Vinoshipper webhook secret** — I'll wire the verification code first; you'll add the secret value when you enable the webhook in your VS producer dashboard.
3. **OK to defer buyer confirmation emails** — only gift recipient + club shipment emails this round?

## Technical notes

- Webhook handler returns 200 fast and enqueues work to `pgmq` (`transactional_emails` queue) so VS retries don't fan out duplicate sends.
- Idempotency key per email = `${vs_order_id}:${template_name}` so re-deliveries from VS never double-send.
- All emails respect `suppressed_emails` (bounces, unsubscribes) automatically.
- Tasting notes pulled from `wine_products.tasting_notes` / `pairings` at send time (not snapshot) so updates flow forward.