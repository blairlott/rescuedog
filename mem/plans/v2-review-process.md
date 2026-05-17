---
name: v2 Review Process — Lindy + Claude
description: How the v2 unified-checkout spec gets reviewed, what each reviewer owns, and the sign-off gates before code goes live.
type: feature
---
# v2 Review Process

Two reviewers, one spec (`mem://specs/v2-unified-checkout-spec.md`), three gates.

## Reviewers

### Lindy — Operations & compliance reviewer
**Owns:** human-in-the-loop checks, ops sanity, compliance posture, customer-facing copy, exception workflows.
**Will challenge:**
- Section 5 (compliance rules): are all states + adult-signature requirements captured? Any state where VS won't ship that we still list?
- Section 7 (failure modes): is the refund + email workflow humane and legally clean?
- Section 8 (VS questions): are these the right questions to put to the VS rep?
- Customer messaging on blocked carts, age-verification fallback, and post-payment refunds.

**Out of scope for Lindy:** writing code, touching the DB, deciding API shapes.

### Claude — Technical reviewer
**Owns:** API contracts, data integrity, security, idempotency, edge-function architecture.
**Will challenge:**
- Section 4 (data contracts): are the schemas tight? Should `complianceToken` be JWT-signed instead of opaque?
- Section 3 (system map): is the webhook split correct? What about partial fulfillment, partial refunds?
- Race conditions: customer pays while VS inventory drops to zero between estimate and post.
- HMAC verification, replay-attack protection, rate limits on `vs-compliance-check`.

**Out of scope for Claude:** customer copy, ops workflows, state-by-state compliance details.

## Process

```text
                      ┌───────────────────────────────┐
   Spec drafted ─────►│ Gate 1: Independent review    │
                      │  Lindy + Claude each return   │
                      │  written comments in 48h      │
                      └───────────────┬───────────────┘
                                      │
                      ┌───────────────▼───────────────┐
                      │ Gate 2: Reconciliation        │
                      │  RDW eng merges feedback,     │
                      │  publishes spec v0.2          │
                      │  with diff + rationale        │
                      └───────────────┬───────────────┘
                                      │
                      ┌───────────────▼───────────────┐
                      │ Gate 3: Implementation green-light │
                      │  Both reviewers sign           │
                      │  "approved-with-caveats" or    │
                      │  "blocked" on spec v0.2        │
                      └───────────────────────────────┘
```

## Deliverables per reviewer

Both return a single markdown file with:
1. **Verdict:** approve / approve-with-caveats / block.
2. **Must-fix:** numbered list, each tied to a spec section.
3. **Should-fix:** suggestions, non-blocking.
4. **Open questions:** items to put back to RDW or VS.

Lindy's file goes to `mem://reviews/v2-lindy-review.md`.
Claude's file goes to `mem://reviews/v2-claude-review.md`.

## Implementation rules during review

- Sandbox work in `src/v2/` and `supabase/functions/vs-compliance-check/` + `shopify-wine-mirror-sync/` continues.
- No flips of `VITE_V2_STORE_ENABLED` in production until Gate 3 passes.
- No writes to live Shopify wine products until `V2_MIRROR_DRY_RUN=false` is set, which requires Gate 3.

## What is already scaffolded

- `/v2/*` routes, `cartStoreV2`, feature flag.
- Edge fn `vs-compliance-check` (stub returning `{ allowed: true }`).
- Edge fn `shopify-wine-mirror-sync` (dry-run diff plan, no writes).
- Plan + spec in `mem://plans/` and `mem://specs/`.

## What is NOT yet built (post-review)

- Real `vs-compliance-check` wired to VS `/api/v3/p/orders/check-compliance`.
- `shopify-order-router-v2` (webhook).
- `vs-fulfillment-bridge` (VS → Shopify roundtrip).
- Wine club bridge for per-shipment VS push.
- `v2_compliance_tokens` table + reconcile job.
