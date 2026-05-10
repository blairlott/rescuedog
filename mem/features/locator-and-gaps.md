---
name: Native Store Locator + Distribution Gaps
description: Future build to replace Grappos with owned locator, analytics, suggest-a-retailer, AI discovery, and depletion report parsing
type: feature
---
Replace Grappos iframe with native locator tied to CRM. Goal: own the data, surface distribution gaps as actionable prospect leads.

## Scope (post May-18 cutover, phased)

**Phase 1 (late May)**
- Public `/where-to-buy` — Leaflet map + list, zip radius search, on/off-premise + wine/merch filters, mobile-first, brand styling (sharp edges, #c30017)
- Pulls from `sales_accounts` (new `is_public` flag controls visibility)
- New table `locator_searches` — logs zip, lat/lng, results count, click-to-directions/call events
- Suggest-a-Retailer form — surfaces on 0-result or >25mi searches; new `retailer_suggestions` table; flows to CRM as lead with `source = customer_suggestion`; ties into referral points if suggested store becomes active account
- Grappos historical CSV/Excel import at `/crm/gaps/import` — column-mapping UI, geocodes zip-only rows, writes to `locator_searches` with `source = 'grappos_import'` preserving original timestamps (warm start, not cold)
- Sunset Grappos iframe

**Phase 2 (June)**
- `/crm/gaps` view — heatmap + ranked table of zips with unmet demand (0 results or nearest account >25mi)
- One-click "Create prospect in this zip" → drops `sales_accounts` row, status=prospect, pre-filled
- Integrates with existing CRM staleness tracking
- Monthly auto-report to ownership: top 10 unmet-demand zips
- Retailer Discovery AI (`/crm/gaps/discover`) — Lovable AI Gateway + web search; returns ranked candidate retailers (independent wine/bottle shops, premium-leaning, dog/rescue angle); one click → prospect account assigned to territory rep; can run on schedule for top 10 zips

**Phase 3 (June/July)**
- Depletion Report Reformatter (`/crm/depletions`) — drag-drop distributor reports (PDF, Excel, CSV); Lovable AI normalizes to standard schema (distributor, account, address, SKU, cases, period); fuzzy-matches to `sales_accounts`, flags unmatched; updates `last_order_date` → feeds staleness; new tables `depletion_reports` + `depletion_report_lines` for trending

## Tech
- Lovable AI Gateway for both AI features (no extra keys; LOVABLE_API_KEY already provisioned)
- Geocoding: Nominatim free tier for MVP
- New tables: `locator_searches`, `retailer_suggestions`, `depletion_reports`, `depletion_report_lines`
- New edge functions: `discover-retailers`, `parse-depletion-report`
- "Last verified" column on `sales_accounts` + nudge to reps to keep public map fresh

## Hard rules
- DO NOT add any of this to the May 18 cutover. Phase 1 starts AFTER green publish-to-live.
- Public map source of truth = CRM. Reps must maintain account accuracy.

## Phase 4 — Retail data intake + ad signal loop (Q3/Q4)
**Inputs**: Instacart Ads API or Brand Portal CSV; large-chain scan data (Nielsen/Circana, Total Wine Vendor Insights, Kroger 84.51°, Amazon Vendor Central, Target POL, Costco CRX). Each chain = its own ingest adapter; reuse Phase 3 AI normalizer.
**New tables**: `retail_sales_facts` (date, account_id, zip, sku, units, dollars, source, period_grain), `retail_sales_sources`, `ad_signal_dispatches`.
**Signal engine** (edge fn `compute-ad-signals`, nightly): scores velocity surge, decline, distribution-without-demand, demand-without-distribution (feeds gaps view), halo zips.
**Outbound**: Meta Custom Audiences/CAPI, Google Customer Match + geo bid adj, Klaviyo segment triggers, OOH later. All dispatches logged for ROI loop.
**Customer signaling**: "RDW selling fast at [Store] near you" emails to locator-search users + wine club members in surge zips.
**Cost flags**: Nielsen/Circana ~$30k+/yr — only after Phase 2/3 prove model. Most retailer portals = manual/CSV first, automate later. Instacart Ads API needs brand acct + spend min. Legal review needed on scan data usage rights for ad targeting.

## Phase 5 (year 2)
Full multi-chain automation, Nielsen if ROI, fully automated ad-platform push with budget guardrails.
