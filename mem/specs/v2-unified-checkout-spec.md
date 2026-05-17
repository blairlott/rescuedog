---
name: v2 Unified Checkout — Technical Specification
description: Reviewable spec for Lindy + Claude. Shopify Payments + Vinoshipper API fulfillment. Sandboxed at /v2/*.
type: feature
---
# v2 Unified Checkout — Spec v0.1

**Status:** DRAFT for review (Lindy ops, Claude technical)
**Owner:** RDW engineering
**Last updated:** 2026-05-17
**Sandbox:** `/v2/*` routes, `cartStoreV2`, feature flag `VITE_V2_STORE_ENABLED`. Zero impact on production.

## 1. Goal

Replace the wine deep-link handoff to Vinoshipper with a single unified Shopify checkout that:
1. Accepts payment for wine + merch in one transaction (Shopify Payments).
2. Stays compliant via Vinoshipper's API for age/state verification, excise tax, and licensed shipping.
3. Preserves RDW's winery license — VS is fulfillment partner, not merchant-of-record.

## 2. Non-goals

- Replacing Vinoshipper as compliance/fulfillment system.
- Subscriptions cutover (Wine Club stays on VS-direct charges until Phase 2).
- Removing the legacy `/shop` flow (kept until v2 passes 30-day QA).

## 3. System map

```text
 Browser (/v2/*)
   │
   ├── cartStoreV2 (localStorage: rdw-cart-v2)
   │
   ├── POST /functions/v1/vs-compliance-check
   │     → VS /api/v3/p/orders/check-compliance
   │     ← { allowed, blockedSkus, taxesCents, feesCents, shippingCents, complianceToken }
   │
   ├── Shopify Storefront API
   │     cartAttributesUpdate { complianceToken, dob, shipTo }
   │     cartLinesAdd "Wine shipping, tax & fees" line
   │     → checkoutUrl?channel=online_store  (new tab)
   │
   └── (post-payment)
        Shopify orders/paid webhook
          → POST /functions/v1/shopify-order-router-v2
                ├── split lines: wine vs merch
                ├── wine → VS /api/v3/orders  { paid: true, fees, taxes, complianceToken }
                └── merch → existing fulfillment path
        VS webhooks (TRACKING_NUMBER_ADDED, CANCELLED, CARD_DECLINED)
          → POST /functions/v1/vs-fulfillment-bridge
                └── Shopify Admin: fulfillment / refund
```

## 4. Data contracts

### 4.1 `vs-compliance-check` request
```json
{
  "dob": "1989-04-12",
  "shipTo": { "name":"…", "street1":"…", "city":"…", "state":"CA", "zip":"…" },
  "lines": [{ "sku":"RDW-CAB-2022", "qty": 2 }]
}
```
### 4.2 response
```json
{
  "allowed": true,
  "blockedSkus": [],
  "reasons": [],
  "complianceToken": "vs_ct_01HXY…",
  "tokenExpiresAt": "2026-05-17T19:42:00Z",
  "taxesCents": 432,
  "feesCents": 50,
  "shippingCents": 1295
}
```
Token TTL = 30 min. Token + DOB hash + ship-to hash stored in `v2_compliance_tokens` for webhook revalidation.

### 4.3 `shopify-order-router-v2` (Shopify webhook payload)
Validates HMAC, looks up `complianceToken` from cart attributes, re-validates ship-to (auto-refund on mismatch), posts wine lines to VS.

## 5. Compliance rules

| Check | Where | Action on fail |
|---|---|---|
| Age ≥ 21 | interstitial + VS check-compliance | block checkout, surface VS `idScanUrl` after payment if VS flags |
| State allowed for SKU | VS check-compliance | block, offer to remove |
| Ship-to matches what was validated | `orders/paid` webhook | auto-refund wine lines, email customer |
| Adult signature at delivery | VS configures with FedEx/UPS | n/a (carrier-enforced) |

## 6. Tax & fees

- Single Shopify cart line **"Wine shipping, tax & fees"** holding `taxesCents + feesCents + shippingCents` from VS estimate. Reconciled in VS order with explicit `fees` and `taxes` fields when posting `paid:true`.
- Shopify still collects its own sales tax on merch lines.
- VS files state alcohol reports.

## 7. Failure modes

| Scenario | Mitigation |
|---|---|
| VS down at interstitial | Block checkout, show "compliance check unavailable, please retry" — never silently allow. |
| VS down at `orders/paid` | Queue retry (exponential backoff, 24h). Alert via Slack. Do not refund yet. |
| `paid:true` order fails VS post-payment compliance | Auto-refund wine portion, email customer with `idScanUrl` or explanation. |
| Shopify webhook missed | Daily reconcile job: Shopify orders WHERE has wine tag AND no VS order ID → re-route. |
| Customer edits address in Shopify checkout | Re-validate in webhook; mismatch → refund. |

## 8. Open questions for VS rep

1. Test SKUs that don't pollute reporting?
2. Idempotency-key header on `POST /orders` for webhook retries?
3. Exact behavior when `paid:true` order fails post-payment compliance (refund-only? hold? manual review?).

## 9. Rollout

1. Build behind flag (current phase).
2. Internal QA: 3–5 state matrix (CA, TX, NY-blocked, KY-restricted, FL).
3. VS UAT with test SKUs.
4. Soft launch: flip flag for 5% of traffic via `useFeatureFlag`.
5. Cutover: swap `/shop` to v2, archive legacy, delete `src/legacy/` after 2 weeks of clean data.
