---
name: Merch Self-Curation
description: AI scans dropship SKUs for availability/margin/freshness issues and queues admin-approved actions
type: feature
---
- Edge fn `merch-curation-scan` polls vendor APIs (simulated until live) and writes proposals to `merch_curation_actions`.
- Action types: remove_unavailable, replace_sku, adjust_price, add_recommendation, restock_alert, margin_warning.
- All proposals are `pending` — store admin approves/rejects in `/dropship` → AI Curation tab.
- Edge fn `merch-curation-apply` enforces dropship_manager role and applies the change (deactivate SKU, promote replacement, update price, draft new SKU).
- Per-SKU policy on `dropship_skus`: `target_margin_percent` (default 50), `min_margin_percent` (default 30), `auto_curate` toggle, `vendor_availability`.
- Schedule with pg_cron once vendor APIs are live; for now run on-demand from the dashboard.
