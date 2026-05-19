# The Kennel — Phase 3 Scope (Draft for Evaluation)

**Status:** Draft — pending external review
**Author:** Lovable agent + RDW operator
**Date:** 2026-05-19
**Prereq:** Phase 2 complete (ingest → analyze → recommend → guardrail → execute → log) + self-serve credentials UI

---

## 1. Context (for a reviewer with no prior knowledge)

Rescue Dog Wines (RDW) runs a multi-channel paid-media program: Google Ads, Meta Ads, Instacart Ads, and a Yahoo DSP stub. "The Kennel" is the in-app ops console (`/kennel/*`) that ingests platform data into a unified `ad_performance_facts` table, surfaces recommendations, enforces per-channel guardrails (spend caps, max bid/budget change %), and can execute changes on Meta with a rollback path. Google, Instacart, and Yahoo are currently dispatched-only.

Today, after Phase 2, The Kennel can answer:
- "What did we spend yesterday, by channel/campaign/ad?"
- "Which creatives are fatiguing? Which dayparts are profitable?"
- "What does the AI recommend right now, and is it within guardrails?"
- "What did we (or the AI) actually change, and can we roll it back?"

It **cannot yet** answer:
- "Are these conversions incremental, or would they have happened anyway?"
- "What's the optimal budget allocation across channels for next week?"
- "Is something broken right now (pixel, feed, attribution)?"
- "What is each customer actually worth over 12 months, and are we bidding for that?"

Phase 3 is about closing those four gaps.

---

## 2. Phase 2 Polish (close before Phase 3 ships)

Small items that make Phase 3 results trustworthy. Treat as Phase 2.1, not Phase 3.

| # | Item | Why it matters | Est. effort |
|---|------|----------------|-------------|
| 1 | "Test connection" button per provider on `/kennel/integrations` (calls ingest with `dry_run=true`) | Verifies a pasted key works before relying on it | 1h |
| 2 | `integration_credential_events` audit log (who saved/deleted, when, no values) | SOC2-lite posture; required if multiple admins ever rotate keys | 1h |
| 3 | Cron schedule panel on `/kennel/channels` showing last-run / next-run per ingest function (from `pg_cron`) | Makes invisible automation visible; catches silent failures | 1h |

---

## 3. Phase 3 Proposed Scope

### 3a. Trust & Signal Layer (ship first)

#### 3a.i — Anomaly alerts
- **What:** STL decomposition on `spend`, `clicks`, `conversions`, `revenue`, `cpa`, `roas` per channel per day. Flag residuals > 2σ over a 30-day rolling baseline.
- **Edge function:** `kennel-anomaly-detector` (nightly cron)
- **Surfaces in:** `/kennel/dashboard` (red banner), Slack webhook, email digest
- **DB:** `ad_anomalies` (channel_id, metric, observed, expected, z_score, severity, status, resolved_by, resolved_at)
- **Why first:** Catches pixel breakage, feed corruption, billing pauses within hours. Every other Phase 3 module is only as good as the data it sees; this protects them all.
- **Risk:** False positives on launch days / new campaigns. Mitigation: per-campaign cold-start window (14d) before alerts fire.

#### 3a.ii — LTV-bidding feed
- **What:** Predict 12-month LTV per converting customer using order history + cohort decay. Send the predicted LTV (not first-order revenue) as the conversion value to Meta CAPI and Google Enhanced Conversions.
- **Edge function:** `kennel-ltv-predictor` (nightly batch) + extend existing `meta-capi` and `google-enhanced-conversions` senders.
- **Model:** Start with a simple `repeat_rate × AOV × margin` formula bucketed by acquisition channel + first-product category. Upgrade to a survival model in Phase 4.
- **DB:** `customer_ltv_predictions` (user_id, predicted_12mo_value_cents, model_version, computed_at, confidence)
- **Why second:** Trains the ad platforms on the right objective. Without it, Meta optimizes for $25 sampler buyers when a club signup is worth $400+. Single highest-leverage change in the roadmap.
- **Risk:** Garbage-in / garbage-out. Mitigation: hold-out validation against a 12-month back-test before pushing to platforms; admin toggle to revert to gross-revenue mode.

### 3b. Decision Layer (ship after 3a has 30 days of clean data)

#### 3b.i — Budget optimizer
- **What:** Nightly linear program that reallocates next-day spend across channels to maximize blended true-ROAS within existing guardrails. Output goes into `ad_recommendations` for human approval (or auto-execute if `kennel.auto_optimize=true`).
- **Edge function:** `kennel-budget-optimizer` (nightly)
- **Model:** Convex optimization with diminishing-returns curves fit from the last 60d of facts. Falls back to "do nothing" if it can't find a solution >10% better than current.
- **DB:** Reuses `ad_recommendations` + new `ad_response_curves` (channel_id, fit_date, model_params jsonb).
- **Surfaces in:** `/kennel/recommendations` (new "Budget optimizer" tab).

#### 3b.ii — Audience builder
- **What:** UI on top of CRM cohorts (lapsed 90d, high-LTV, club members, ambassadors) that pushes seed lists to Meta/Google/Yahoo via their customer-match APIs. Email is SHA256-hashed client-side before leaving the browser.
- **Routes:** `/kennel/audiences` (list, create, sync status).
- **Edge functions:** `kennel-audience-sync-meta`, `kennel-audience-sync-google`, `kennel-audience-sync-yahoo`.
- **DB:** `ad_audiences` (id, cohort_definition jsonb, last_sync_at, sync_status_by_platform jsonb).
- **Compliance:** Wine — no targeting of users in dry states; the builder filters those out automatically.

### 3c. Measurement Layer (ship last, requires 60+ days of clean facts)

#### 3c.i — Incrementality testing
- **What:** Geo-holdouts + synthetic control (CausalImpact-style). Pause a channel in 20% of DMAs, model expected revenue from control DMAs, attribute the lift back. Writes lift % into `ad_performance_facts.incremental_revenue`.
- **Edge function:** `kennel-incrementality-runner` (per-test lifecycle).
- **DB:** `ad_incrementality_tests` (id, channel_id, holdout_dmas[], control_dmas[], started_at, ended_at, lift_pct, p_value, status).
- **Why last:** Requires 3b audiences to define holdouts cleanly and 3a.ii LTV to make lift meaningful.
- **Expected finding (industry baseline):** branded search is 60-80% non-incremental; typically frees 15-30% of total ad budget.

#### 3c.ii — MMM-lite (Marketing Mix Modeling)
- **What:** Weekly Bayesian model on a 90-day window. Decomposes total revenue into channel contribution + baseline + seasonality + halo. Outputs a board-ready chart + saturation curve per channel.
- **Edge function:** `kennel-mmm-runner` (Sundays).
- **Model:** PyMC-Marketing or Robyn-style adstock + saturation. Run as a separate Python edge function (or Modal/Replicate if Deno-native isn't viable).
- **Surfaces in:** `/kennel/mmm` — channel contribution waterfall, saturation curves, scenario planner.

---

## 4. Out of Scope for Phase 3 (parking lot)

- Competitive intel (Firecrawl + SEMrush) — useful but doesn't depend on Phase 2 infra; ship anytime.
- TV / OOH / podcast attribution — needs MMM first.
- Cross-device identity resolution — wait for industry standards to settle.
- Generative creative testing — separate workstream, not paid-media ops.

---

## 5. Open Questions for the Reviewer

1. **Sequencing:** Is Trust → Decision → Measurement the right order? Or should MMM ship first to inform optimizer effort?
2. **LTV model:** Is a simple repeat-rate formula good enough for v1, or go straight to a survival model? Wine has unusually long repurchase cycles (45-90 days for non-club).
3. **Auto-execute appetite:** Phase 2 keeps a human in the loop on Meta. Should the budget optimizer auto-execute within guardrails, or always require approval?
4. **Incrementality blast radius:** 20% DMA holdout is industry default. Given RDW's geographic concentration (CA, TX, NY drive ~50% of revenue), should we cap holdouts to "non-top-10" to protect revenue?
5. **MMM build vs buy:** PyMC-Marketing is free (Python). Robyn (Meta) is free but R-based. Recast/Mass/Magic are $30-100k/yr SaaS. For a single-brand sub-$10M-ad-spend operation, is build justified?
6. **Yahoo DSP:** Scaffolded but no seat yet. Pursue for Phase 3, or kill the stub and reclaim surface area?

---

## 6. Success Criteria

Phase 3 ships successfully if, by end-of-quarter:

- **3a.i:** ≥1 real anomaly caught and resolved before manual review would have spotted it.
- **3a.ii:** Predicted LTV in production for ≥30 days with <20% MAPE vs actual 30-day revenue (proxy for 12-mo).
- **3b.i:** Optimizer-suggested allocations beat operator allocations on blended ROAS in ≥3 of 4 weeks.
- **3b.ii:** ≥3 audience pushes live across ≥2 platforms with verified match rates >50%.
- **3c.i:** ≥1 completed incrementality test with statistically significant result (p<0.10).
- **3c.ii:** First MMM report delivered, reviewed, and acted on (budget shift OR explicit "no change" decision).

---

## 7. Estimated Effort

| Block | Calendar weeks | Notes |
|-------|---------------|-------|
| Phase 2.1 polish | 0.5 | Bundle into Phase 3 kickoff |
| 3a.i Anomaly alerts | 1 | Mostly SQL + STL; React surface is small |
| 3a.ii LTV-bidding | 2 | Model + back-test + CAPI/GEC wiring |
| 3b.i Budget optimizer | 2 | Bulk of work is curve-fitting + UX, not LP solver |
| 3b.ii Audience builder | 2 | One week per ad platform; can run in parallel |
| 3c.i Incrementality | 2 | Plus 2-4 weeks calendar time for tests to run |
| 3c.ii MMM-lite | 3 | Most uncertain; depends on build-vs-buy answer |

**Total active build:** ~12 weeks (3 calendar months) for one engineer + Lovable agent.

---

## 8. What I'd Like Claude to Evaluate

1. **Is the sequencing defensible?** Is "trust → decision → measurement" right, or am I missing a dependency that flips two of these?
2. **Are any of these a trap?** (MMM-lite is famously easy to start, hard to finish well for a single brand. Should it be killed?)
3. **What's missing?** What would a senior paid-media engineer expect to see in a Phase 3 plan that isn't here?
4. **Risk ranking:** Which module has the highest probability of shipping but producing misleading output the operator might act on? (Where do we most need a "provisional" warning?)
5. **Honest effort assessment:** Are the week estimates plausible for a solo engineer + AI pair, or is this a 6-month plan in disguise?
