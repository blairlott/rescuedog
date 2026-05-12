---
name: Vinoshipper Go-Live Checklist
description: Step-by-step to flip from simulation to live Vinoshipper (do when laptop available)
type: feature
---
Project sits in SIMULATION until these steps run. All infra exists; no new code needed.

## Steps to go live
1. **Register webhooks** in VS dashboard → Webhooks → New Webhook. Endpoint URL for all:
   `https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/vinoshipper-webhook`
   Create one per Type — **ORDER** and **CLUB_MEMBERSHIP** are the two that matter. Skip CUSTOMER/PRODUCT/CART for v1 (low value, add later if needed). VS UI has no secret field.
2. **Add Lovable secrets**: `VINOSHIPPER_API_KEY_ID`, `VINOSHIPPER_API_SECRET`, `VINOSHIPPER_PRODUCER_ID`. (Skip `VINOSHIPPER_WEBHOOK_SECRET` — VS doesn't send one.)
3. **Frontend flip**: in `src/lib/vinoshipperConfig.ts` set `VS_SIMULATION = false` and `VS_ACCOUNT_ID = <real numeric id>`.
4. **Per-partner flip**: `UPDATE dropship_partners SET simulation_mode = false WHERE …` for each live vendor.
5. **Verify**: place a test order in VS, watch row land in `vinoshipper_webhook_logs` with `processed = true`.

## Why we waited
Webhook registration requires the VS dashboard which is hard on mobile. Simulation already exercises the full pipeline (membership row, discount sync, dropship dispatch) so nothing is blocked.

## What NOT to add
- Do NOT recreate `vinoshipper_webhook_events` table — use existing `vinoshipper_webhook_logs`.
- Do NOT add `vinoshipper_product_id` to `merch_products` — use existing column on `dropship_skus`.
