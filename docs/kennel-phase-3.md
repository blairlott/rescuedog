# The Kennel — Phase 3 Scope (Draft for Evaluation)

**Status:** Draft — pending external review
**Author:** Lovable agent + RDW operator
**Date:** 2026-05-19 (rev. 2)
**Prereq:** Phase 2 complete (ingest → analyze → recommend → guardrail → execute → log) + self-serve credentials UI + Phase 2.1 polish (Mailchimp & Yahoo DSP wiring, audit log, cron panel, test-connection buttons)

---

## 1. Context (for a reviewer with no prior knowledge)

Rescue Dog Wines (RDW) runs a multi-channel media program spanning **paid and owned**: Google Ads, Meta Ads, Instacart Ads, a Yahoo DSP stub, and Mailchimp (lifecycle + retailer-signal email). "The Kennel" is the in-app ops console (`/kennel/*`) that ingests platform data into a unified `ad_performance_facts` table, surfaces recommendations, enforces per-channel guardrails (spend caps, max bid/budget change %), and can execute changes on Meta with a rollback path. Google, Instacart, and Yahoo are dispatched-only. Mailchimp is being wired in alongside Phase 2.1 polish — initially as an ingest source (campaign-level metrics, list health) and a draft-only dispatch target; auto-send is prohibited (see §5 hard constraints).

Today, after Phase 2 (+2.1), The Kennel can answer:
- "What did we spend yesterday, by channel/campaign/ad — and what did email contribute?"
- "Which creatives are fatiguing? Which dayparts / send-times are profitable?"
- "What does the AI recommend right now, and is it within guardrails?"
- "What did we (or the AI) actually change, and can we roll it back?"

It **cannot yet** answer:
- "Are these conversions incremental, or would they have happened anyway?"
- "What's the optimal budget allocation across paid channels for next week?"
- "Is something broken right now (pixel, feed, attribution, deliverability)?"
- "What is each customer actually worth over 12 months, and are we bidding / emailing for that?"
- "Which search queries are wasting spend, and which deserve their own exact match?"

Phase 3 closes those gaps.

---

## 2. Phase 2 Polish (close before Phase 3 ships)

Small items that make Phase 3 results trustworthy. Treat as Phase 2.1, not Phase 3.

| # | Item | Why it matters | Est. effort |
|---|------|----------------|-------------|
| 1 | "Test connection" button per provider on `/kennel/integrations` (calls ingest with `dry_run=true`) | Verifies a pasted key works before relying on it | 1h |
| 2 | `integration_credential_events` audit log (who saved/deleted, when, no values) | SOC2-lite posture; required if multiple admins ever rotate keys | 1h |
| 3 | Cron schedule panel on `/kennel/channels` showing last-run / next-run per ingest function (from `pg_cron`) | Makes invisible automation visible; catches silent failures | 1h |
| 4 | Mailchimp + Yahoo DSP credential + ingest wiring | Required so Phase 3 modules (anomaly, audience, LTV cadence) have data | bundled |

---

## 3. Phase 3 Proposed Scope

### 3a. Trust & Signal Layer (ship first)

#### 3a.i — Anomaly alerts
- **What:** STL decomposition on `spend`, `clicks`, `conversions`, `revenue`, `cpa`, `roas` per channel per day, **plus email-specific metrics**: deliverability, open rate, CTR, revenue per send, list churn. Flag residuals > 2σ over a 30-day rolling baseline.
- **Channels covered:** Google, Meta, Instacart, Yahoo, **Mailchimp**.
- **Edge function:** `kennel-anomaly-detector` (nightly cron)
- **Surfaces in:** `/kennel/dashboard` (red banner), Slack webhook, email digest
- **DB:** `ad_anomalies` (channel_id, metric, observed, expected, z_score, severity, status, resolved_by, resolved_at)
- **Why first:** Catches pixel breakage, feed corruption, billing pauses, deliverability cliffs within hours. Every other Phase 3 module is only as good as the data it sees; this protects them all.
- **Risk:** False positives on launch days / new campaigns / new send segments. Mitigation: per-campaign cold-start window (14d) before alerts fire.

#### 3a.ii — LTV-bidding feed
- **What:** Predict 12-month LTV per converting customer using order history + cohort decay. Send the predicted LTV (not first-order revenue) as the conversion value to Meta CAPI and Google Enhanced Conversions. **LTV deciles also drive Mailchimp segmentation and cadence** — no platform bid for email, cohort policy only (e.g. top-decile gets premier-club nurture; bottom-decile suppressed from winback).
- **Edge function:** `kennel-ltv-predictor` (nightly batch) + extend existing `meta-capi` and `google-enhanced-conversions` senders + Mailchimp segment sync.
- **Model:** Start with a simple `repeat_rate × AOV × margin` formula bucketed by acquisition channel + first-product category. Upgrade to a survival model in Phase 4.
- **DB:** `customer_ltv_predictions` (user_id, predicted_12mo_value_cents, model_version, computed_at, confidence)
- **Hard gate (non-negotiable):** Model must have **≥12 months of historical predictions backtested** against realized revenue before any push to Meta/Google. If we don't have 12 months of forward predictions, generate **retroactive predictions on archived order data** (predict-as-of-T using only data available at T) and validate against actuals. No backtest, no platform push. Mailchimp cohort use is allowed before the gate (lower blast radius).
- **Why second:** Trains the ad platforms — and email — on the right objective. Without it, Meta optimizes for $25 sampler buyers when a club signup is worth $400+, and Mailchimp blasts the same cadence to a $1,200 LTV member and a one-time gifter. Single highest-leverage signal in the roadmap.
- **Risk:** Garbage-in / garbage-out. Mitigation: the 12-month backtest gate above; admin toggle to revert to gross-revenue mode.
- **Effort:** 3–4 weeks (was 2; backtest infra + retroactive prediction generation + Mailchimp wiring).

#### 3a.iii — Search query mining (Google)
- **What:** Nightly pull of Google Ads search-term reports. LLM classifier (gpt-5-mini) buckets each term into **`negative`** (irrelevant / off-brand / dry-state geo / competitor TM), **`new_exact`** (high-intent term currently served via broad/phrase — promote to its own ad group), or **`keep`** (working as intended). Output lands as `ad_recommendations` rows with kind `search_term_negative` / `search_term_promote`, awaiting human approval.
- **Edge function:** `kennel-search-query-miner` (nightly)
- **DB:** `ad_search_terms` (campaign_id, ad_group_id, term, impressions, clicks, conversions, cost_cents, last_seen, classification, classification_reason, classifier_version)
- **Surfaces in:** `/kennel/recommendations` (new "Search terms" tab) with bulk-approve UX.
- **Why in 3a:** Pure signal layer — no execution risk, immediate spend recovery, no dependency on LTV or optimizer. Typical accounts find 10–30% waste in week one.
- **Effort:** ~1 week.

#### 3a.iv — Creative rotation
- **What:** Acts on the fatigue scores Phase 2 already computes. When a creative crosses the fatigue threshold for N consecutive days **on Meta**, auto-pause it (within guardrails, reversible via the existing rollback path) and surface a "refresh required" recommendation. For Google, dispatch the same recommendation but **no auto-pause** — operator pauses manually in the platform.
- **Edge function:** `kennel-creative-rotator` (daily; reads from existing `creative_fatigue` table)
- **DB:** Reuses `creative_fatigue` + `ad_recommendations` + writes pause actions to `ad_execution_log`.
- **Why in 3a:** Closes the loop on a signal we already produce but currently ignore. No new modeling; mostly orchestration + guardrail wiring.
- **Risk:** Auto-pausing a converting ad that's having a bad week. Mitigation: minimum 7-day fatigue streak before auto-pause; never auto-pause an ad with <14 days of history; daily cap on auto-pauses per account.
- **Effort:** ~1 week.

### 3b. Decision Layer (ship after 3a has 30 days of clean data)

#### 3b.i — Budget optimizer
- **What:** Nightly linear program that reallocates next-day spend across **paid** channels to maximize blended **contribution-margin-ROAS** (not gross revenue-ROAS) within existing guardrails. Output goes into `ad_recommendations` for human approval. **No auto-execute in v1** — every reallocation requires explicit operator sign-off.
- **Channels in LP:** Google, Meta, Instacart, Yahoo. **Mailchimp is excluded** — email is not a budget channel.
- **Edge function:** `kennel-budget-optimizer` (nightly)
- **Model:** Convex optimization with diminishing-returns curves fit from the last 60d of facts. Falls back to "do nothing" if it can't find a solution >10% better than current.
- **Margin plumbing (new):** Add `contribution_margin_cents` to `ad_performance_facts` (or computed-column join) sourced from cost-of-goods, fulfillment, and fuel surcharges per SKU. Without this, the LP is just a revenue-ROAS toy.
- **Prerequisites (both required before this module goes live):**
  1. Contribution-margin column populated and validated.
  2. **A completed branded-search incrementality test from 3c.i** — otherwise the optimizer over-credits branded search and starves prospecting.
- **DB:** Reuses `ad_recommendations` + new `ad_response_curves` (channel_id, fit_date, model_params jsonb) + `ad_performance_facts.contribution_margin_cents`.
- **Surfaces in:** `/kennel/recommendations` (new "Budget optimizer" tab).
- **Effort:** 3–4 weeks (was 2; margin plumbing + incrementality dependency + curve diagnostics).

#### 3b.ii — Audience builder
- **What:** UI on top of CRM cohorts (lapsed 90d, high-LTV, club members, ambassadors) and **Mailchimp segments** that pushes seed lists to Meta/Google/Yahoo via their customer-match APIs. Email is SHA256-hashed client-side before leaving the browser.
- **First deliverable:** **Mailchimp segments → Meta/Google lookalike seed flow.** This is the highest-confidence cohort source we have, and it unlocks compounding lift across paid.
- **Yahoo scope:** lighter than Meta/Google — basic push + match-rate reporting only. No feature parity (no exclusion logic, no auto-refresh, no lookalike expansion) until Yahoo proves out delivery + match rates.
- **Routes:** `/kennel/audiences` (list, create, sync status).
- **Edge functions:** `kennel-audience-sync-meta`, `kennel-audience-sync-google`, `kennel-audience-sync-yahoo`.
- **DB:** `ad_audiences` (id, cohort_definition jsonb, source [crm|mailchimp], last_sync_at, sync_status_by_platform jsonb).
- **Compliance:** Wine — the builder filters out users in **dry states *and* dry counties** (TX especially has heavy county-level patchwork). Filter runs server-side before hashing.

#### 3b.iii — Budget pacing
- **What:** Monthly + quarterly spend pace tracking per channel and at the portfolio level. Surfaces "on pace / behind / ahead" + projected EOM/EOQ landing. Fires alerts when a channel is projected to miss budget by >10% with >7 days left. The daily envelope it produces feeds 3b.i's LP as a hard upper bound (the optimizer can't reallocate past the month's remaining budget).
- **Edge function:** Extends existing `kennel-pacing` from Phase 2 — adds quarterly window, per-channel envelope output, and Slack/email alert routing.
- **DB:** `ad_budget_pacing_snapshots` (period, channel_id, period_start, period_end, budget_cents, spent_cents, projected_cents, status, captured_at).
- **Why in 3b:** Decision-layer, but cheap; ships before the optimizer to give it a clean envelope on day one.
- **Effort:** ~0.5 weeks.

### 3c. Measurement Layer (ship last, requires 60+ days of clean facts)

#### 3c.i — Incrementality testing
- **What:** Geo-holdouts + synthetic control (CausalImpact-style). Pause a channel in a holdout, model expected revenue from control geos, attribute the lift back. Writes lift % into `ad_performance_facts.incremental_revenue`.
- **First test:** **Google branded search** — runs *before* 3b.i ships. Branded search is industry-baseline 60–80% non-incremental; getting a real number here is the single most valuable measurement input to the optimizer.
- **Method by market tier:**
  - **Top-10 DMAs (CA, TX, NY heavy):** synthetic control only. Never DMA-pause a top market — revenue concentration is too high to risk a true holdout.
  - **Non-top-10 DMAs:** 20% DMA holdout is allowed; standard geo-experiment design.
- **Edge function:** `kennel-incrementality-runner` (per-test lifecycle).
- **DB:** `ad_incrementality_tests` (id, channel_id, method [holdout|synthetic], holdout_dmas[], control_dmas[], started_at, ended_at, lift_pct, p_value, status).
- **Email incrementality:** scoped here for visibility but **lower priority than paid tests** — Phase 4 unless paid tests finish ahead of schedule.

---

## 4. Out of Scope for Phase 3 (parking lot)

- **MMM-lite (Marketing Mix Modeling)** — Deferred to **Phase 4**. Rationale: MMM-lite is famously easy to start and hard to finish well for a single brand. For it to produce trustworthy channel decomposition we need (a) **18+ months of clean facts** (we'll have ~6 at Phase 3 kickoff) and (b) **at least one completed incrementality test** to anchor the model's prior on branded search lift — otherwise MMM will confidently mis-attribute the same revenue the optimizer is already chasing. Revisit when both conditions are met.
- Competitive intel (Firecrawl + SEMrush) — useful but doesn't depend on Phase 2 infra; ship anytime.
- TV / OOH / podcast attribution — needs MMM first.
- Cross-device identity resolution — wait for industry standards to settle.
- Generative creative testing — separate workstream, not paid-media ops.

---

## 5. Hard Constraints (not config flags — encoded in the data path)

These are non-negotiable invariants. They are **not** admin toggles, not feature flags, not "default off." Future agents and operators cannot override them without a code change + review.

1. **Alcohol compliance: no Kennel email auto-sends, ever.** Every Mailchimp dispatch path from The Kennel produces a **draft** in Mailchimp — never a send. Encoded as a hard constraint in the Mailchimp dispatch layer, mirroring the existing Z11 rule for retailer-naming sends. No env var, no admin setting, can flip this off.
2. **Attribution priority is enforced at the table level** against Vinoshipper invoice IDs. Default order: **email > paid retargeting > paid prospecting > organic**. Operator-configurable order *per channel* via `ad_settings`, but the **uniqueness invariant** — no invoice may be attributed to more than one channel — is a DB constraint, not application logic. This must be in place before Mailchimp revenue lands in `ad_performance_facts`; otherwise we'll double-count email lift against retargeting.

---

## 6. Success Criteria

Phase 3 ships successfully if, by end-of-quarter:

- **3a.i:** ≥1 real anomaly caught and resolved before manual review would have spotted it (paid or email).
- **3a.ii:** Predicted LTV in production for ≥30 days with <20% MAPE vs actual 30-day revenue (proxy for 12-mo). 12-month backtest gate cleared before any platform push.
- **3a.iii:** ≥$X recovered via search-term negatives in the first 30 days (target set at kickoff once baseline waste is measured).
- **3a.iv:** ≥10 fatigued Meta creatives auto-rotated with zero rollbacks initiated by the operator.
- **3b.i:** **Contribution-margin-ROAS** (not revenue-ROAS) in production as the optimizer's objective. Optimizer-suggested allocations beat operator allocations on contribution-margin-ROAS in ≥3 of 4 weeks.
- **3b.ii:** ≥3 audience pushes live across ≥2 platforms with verified match rates >50%, **including a Mailchimp segment → lookalike seed flow at ≥50% match rate**.
- **3b.iii:** Pacing alerts firing on at least one real near-miss before EOM.
- **3c.i:** ≥1 completed incrementality test with statistically significant result (p<0.10) — branded-search test completed before 3b.i ships.

---

## 7. Estimated Effort

| Block | Calendar weeks | Notes |
|-------|---------------|-------|
| Phase 2.1 polish (+ Mailchimp/Yahoo wiring) | 1 | Bundle into Phase 3 kickoff |
| 3a.i Anomaly alerts (paid + email) | 1 | STL + small React surface |
| 3a.ii LTV-bidding | 3–4 | Model + 12-mo backtest + retro predictions + CAPI/GEC/Mailchimp wiring |
| 3a.iii Search query mining | 1 | Nightly job + classifier + recs UI |
| 3a.iv Creative rotation | 1 | Orchestration on existing fatigue signal |
| 3b.i Budget optimizer | 3–4 | Margin plumbing + LP + curve diagnostics; gated on 3c.i branded test |
| 3b.ii Audience builder | 2 | Mailchimp→lookalike first; Yahoo light scope |
| 3b.iii Budget pacing | 0.5 | Extends Phase 2 pacing job |
| 3c.i Incrementality | 2 | Plus 2–4 weeks calendar time for tests to run; branded search first |

**Total active build:** ~16 weeks for one engineer + Lovable agent.

---

## 8. What I'd Like Claude to Evaluate

1. **Is the sequencing defensible?** Is "trust → decision → measurement" right, or am I missing a dependency that flips two of these? (Note: branded-search incrementality from 3c.i is now an explicit prerequisite for 3b.i — that crossing is intentional.)
2. **Are any of these a trap?** With MMM-lite deferred to Phase 4, the remaining candidate is the budget optimizer — is contribution-margin-ROAS as the objective the right call, or am I trading a clean-but-wrong metric for a right-but-noisy one?
3. **What's missing?** What would a senior paid-media + lifecycle engineer expect to see in a Phase 3 plan that isn't here, now that email is in scope?
4. **Risk ranking:** Which module has the highest probability of shipping but producing misleading output the operator might act on? (Where do we most need a "provisional" warning?)
5. **Branded-search holdout DMA selection:** Which 10 DMAs (outside the top-10 revenue concentration) make the strongest control set for the first incrementality test? Looking for a defensible methodology, not just a list.
6. **Attribution priority rules:** Operator-configurable per channel (current plan) or hard-coded with a code-change required to alter? The uniqueness invariant is hard-coded either way; the question is the ordering.
7. **Honest effort assessment:** Are the 16 weeks plausible for a solo engineer + AI pair, or is this a 6-month plan in disguise?
