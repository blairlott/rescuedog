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

## Locator UX/feature enhancements backlog (queue behind Phase 1)
Stack-ranked, all additive to the existing `/store-locator` native page. None block May 18.

**Quick wins (1–2 days each)**
- Geolocation "Use my location" button (HTML5 `navigator.geolocation`, falls back to ZIP) — reverse-geocode to ZIP for logging.
- "Get directions" button per result → `https://www.google.com/maps/dir/?api=1&destination=…` (mobile opens native Maps); log click to `locator_searches.events`.
- Click-to-call tracked phone links (already rendered, just instrument).
- Adjustable radius selector (10 / 25 / 50 / 100 mi) — currently hard-coded 25 in RPC; add `_radius_miles` param.
- Sort toggle: distance vs. alpha vs. recently verified.
- Persist last search in `localStorage` so returning visitors land on results, not empty state.
- Empty/low-result state: surface 3 nearest online delivery options (Instacart, Lucky, Bottle Barn, SaveMart) as fallback CTAs.
- Share-search URL: `?zip=94558&premise=off` deep-links populate + auto-search (improves SEO + email/SMS shareability).

**Mid-tier (3–5 days each)**
- SKU filter — "which wines does this store carry?" requires `account_skus` join table populated from depletion reports (Phase 3 dependency, but UI can ship with "all" default).
- Cluster markers at low zoom (`react-leaflet-markercluster`) — current map gets noisy past ~50 pins.
- Map bounds search — "search this area" button when user pans, re-runs RPC against viewport center.
- Verified badge + "Last confirmed {date}" on results — surfaces `last_verified_at`; rep nudge already in plan.
- Per-result hours of operation (Google Places API enrichment, cached weekly to `sales_accounts.hours_json`).
- Photo per location (Places API or rep-uploaded via CRM) — single thumbnail, lazy-loaded.
- Multi-language: Spanish toggle (key markets: CA, TX, FL).
- Accessibility audit pass — keyboard-nav map, screen-reader result list, focus management on search submit.

**Bigger bets (1+ week)**
- Wine club locator overlay — show nearest member pickup events / tasting room partners alongside retail (ties to Wine Club System).
- Event layer — `events` table pinned on map (tastings, dog-rescue events, pop-ups) with date filter.
- "Near me on my route" — paste two ZIPs, get retailers along driving corridor (Mapbox Directions or OSRM).
- SMS-back: "Text your ZIP to 555-RDW-WINE → reply with top 3 stores" (Twilio + reuse RPC).
- Embeddable widget — `<iframe src="/store-locator/embed">` for distributor/partner sites; locked to public-only data, branded chrome.
- Social proof — "12 people searched 94558 this week" pulled from `locator_searches` aggregate (privacy-safe, zip-level only).
- Retailer self-service portal — claim listing, edit hours/photos, request takedown; admin moderation queue in CRM.

**Analytics / instrumentation (cross-cuts)**
- `locator_search_events` table for granular click tracking (directions, call, website, suggest-retailer open) — keep `locator_searches` as parent.
- Funnel dashboard in `/crm/gaps`: searches → result-clicks → directions/call CTR by zip; surfaces dead retailers (high search volume, zero CTR).
- Tie locator search ZIPs into Meta/Google Custom Audiences (Phase 4 dependency, but plumbing is cheap to add now: hash + push to `customer_audiences` table).

**Compliance / trust (do not skip)**
- Auto-rotate the 3-account result set when >3 retailers exist within radius (already in `compliant_retailer_set` design; verify true randomization, not stable-sort) — protects tied-house compliance.
- "Why these stores?" tooltip explaining unaffiliated rotation.
- Robots/SEO: emit `LocalBusiness` JSON-LD per visible result; canonical `/store-locator` only (no per-zip URLs indexed to avoid thin-content penalty).

**Tech debt / polish**
- Debounce ZIP input + auto-search on 5 digits (kill the Search button friction on mobile).
- Skeleton loaders for result cards + map.
- Replace Nominatim with cached server-side geocode (Mapbox or Google) once volume > 1k searches/day — Nominatim TOS caps usage.
- Pre-warm geocode cache for top 200 US ZIPs on deploy.
