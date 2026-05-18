---
name: Partner Ops Console rules
description: Owner-set rules for vs-tracking-verify cadence, marketplace approvals, wine 3PL relay log, and promotion gates
type: feature
---
# Partner Ops Console — operating rules (owner-set 2026-05-18)

## vs-tracking-verify cadence
- **Lindy-triggered only.** No pg_cron. Lindy watches `vs_tracking_relay_log` for rows where `verified_at IS NULL AND attempt_at < now() - interval '2 hours'` and calls `vs-tracking-verify` with `{ all_pending: true }`.
- If the function errors, Lindy alerts — never silently retries.

## Marketplace applications
- Approval does **NOT** auto-create a `dropship_partners` row. Partner row is created on first SKU import (still a human step in the console).
- Lindy nudges if a `marketplace_partner_applications` row sits `pending > 72h`.

## Wine 3PLs (future)
- VS-native fulfillment **skips** `vs_tracking_relay_log` entirely — Vinoshipper owns the tracking, no relay, no verification.
- Relay log is reserved for third-party partners only: Printful, generic dropship, marketplace.

## Promotion to canonical cart — BLOCKED until all three clear
1. `PRINTFUL_API_KEY` pasted as Lovable secret
2. Live $0.01 sticker test round-trips (dispatch → webhook → relay → verify, no mismatch)
3. Lindy alert routing (Slack channels) configured
Do not execute steps 1–8 of the promotion plan in `claude-partner-ops-v2.md` until owner confirms all three.
