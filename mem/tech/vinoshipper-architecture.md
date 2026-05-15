---
name: Vinoshipper Architecture (Injector vs API)
description: Injector owns checkout. REST API is UX-enrichment only — never used to place orders.
type: feature
---
## Hard rule
- **Injector** (vinoshipper.com/injector/index.js) = checkout, payment, age verify, tax, shipping, recurring club billing, card-on-file.
- **REST API** (our edge functions via _shared/vinoshipper.ts) = UX enrichment ONLY:
  - Live inventory pull (sold-out badges)
  - Customer lookup / link by email (vinoshipper-link-customer)
  - Webhook ingestion (vinoshipper-webhook → vinoshipper_webhook_logs)
  - Club membership reads
- **Never** POST `/orders` or `/club-memberships` from our backend. Those happen client-side via Injector so VS owns PCI + compliance.

## Live config (as of 2026-05-15)
- VS_ACCOUNT_ID = "2212"
- VS_SIMULATION = false
- Secrets: VINOSHIPPER_API_KEY_ID, VINOSHIPPER_API_SECRET, VINOSHIPPER_PRODUCER_ID, VS_LIVE_MODE
- Webhooks registered manually in VS dashboard → ORDER + CLUB_MEMBERSHIP → /functions/v1/vinoshipper-webhook
