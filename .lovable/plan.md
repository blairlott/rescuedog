## Kennel Phase 2 — Build Plan

Ships in three waves. 2A is fully live. 2B renders real UI on stub-but-schema-correct data. 2C is receiver endpoints + docs only.

---

### Values to confirm before I build

Please confirm (or override) the defaults below — I'll bake whichever you pick into the `guardrail_baseline` + `ad_settings` rows on first run:

1. **Max single-execution Δ%** vs baseline campaign budget — default **±25%**
2. **Max 24-hr cumulative Δ%** vs baseline — default **±60%**
3. **Daily spend cap multiplier** (baseline daily spend × N) — default **1.5x** global, **1.75x** per channel
4. **Confidence floor for auto-execute** — default **0.80** (below floor → "Needs Approval")
5. **Kill switch scope** — assumed **global + per-channel** (Meta / Google / Instacart) unless you want per-campaign too
6. **Notification provider** — Resend (already wired, secret present) for email + **Twilio (new connector)** for SMS. Confirm and I'll connect Twilio; otherwise name your preferred SMS provider.

Everything else proceeds with the defaults below.

---

## PHASE 2A — Alerts + Live Execution

### Schema (new)

```text
guardrail_baseline
  id, channel, campaign_id (nullable for channel-level rows),
  baseline_daily_budget_cents, baseline_mtd_spend_cents,
  captured_at, source ('auto_daily'|'manual'),
  is_current (bool, unique partial index per channel+campaign)

guardrail_config           -- single row per scope
  scope ('global'|'meta'|'google'|'instacart'),
  max_single_delta_pct, max_24h_cumulative_delta_pct,
  daily_spend_cap_multiplier, confidence_floor,
  kill_switch_enabled, updated_at, updated_by

alert_dispatch_log
  id, event_type ('anomaly'|'recommendation'|'auto_executed'|'rollback'),
  channel, payload jsonb, channels_sent text[] ('email','sms'),
  email_message_id, sms_sid, success, error, created_at
```

Extend existing `ad_execution_log` with: `guardrail_results jsonb`, `executor text`, `before_value`, `after_value`, `baseline_id uuid`. (Most already exist; I'll add what's missing.)

RLS: `is_ad_ops()` for read/write on config + baseline; service-role only for inserts to `alert_dispatch_log` and execution-side writes.

### Edge functions (new / upgraded)

| Function | Role |
|---|---|
| `kennel-baseline-capture` | Captures `daily_budget` per campaign + MTD spend per channel from Meta/Google/Instacart. Run via pg_cron at 08:00 UTC (00:00 PT). Manual trigger from Settings. Flips prior `is_current=true` rows to false. |
| `kennel-execute` (upgrade) | Validates: kill switch → confidence floor → single-exec Δ → 24h cumulative Δ → daily spend cap. Every check writes its result. Only on full pass does it call the platform API. Logs before/after + `executor='auto'\|'manual_approval'`. |
| `kennel-alert-dispatch` | Single entry point. Renders email (Resend) + SMS (Twilio), writes to `alert_dispatch_log`. Called by `kennel-execute`, the optimizer, and the anomaly job. Payload: `{ event_type, channel, action, spend_impact_cents, confidence, deep_link }`. |
| `kennel-rollback` | Reverts an execution to its `before_value`, fires a rollback alert, logs as a separate execution row referencing the original. |

Alert deep links route to `/kennel/log?execution=<id>` for executions and `/kennel/recommendations?id=<id>` for queued recs.

### UI

- **RefreshButton header:** add a small "Last baseline: 4h ago · Refresh" affordance.
- **Settings page:** Guardrail thresholds form (single + 24h Δ%, daily cap multiplier, confidence floor) with per-channel overrides; global + per-channel kill switch toggles (red, sticky banner when any are off).
- **Recommendations page:** items above thresholds get a "Needs Approval" badge; Approve (executes via `kennel-execute`) / Reject (required `reason` field). Both write to `ad_execution_log`.
- **Log page:** add columns for `executor`, guardrail summary chip (✓ all / ✗ which failed), and a "Rollback" action on successful auto-executions within the last 24h.

### Twilio + Resend wiring

- Resend already has `RESEND_API_KEY` → use existing transactional pattern, sender `alerts@notify.<domain>`.
- Twilio: connect via Standard Connector, then `kennel-alert-dispatch` calls the gateway. SMS body kept under 320 chars with the deep link.
- Recipients fixed in `guardrail_config.alert_recipients` (default `blair.lott@rescuedogwines.com` + `+14043120550`); editable from Settings.

---

## PHASE 2B — Enterprise Ad Stack (scaffolded on real schemas)

Renders UI with seeded/stub rows so swapping in real ingestion later is a no-op.

### Schema

```text
customer_signals
  user_id, email, ltv_cents, purchase_count, last_order_at,
  churn_risk_score (0-1), tier ('new'|'repeat'|'vip'|'churn_risk'|'churned'),
  source ('mailchimp_wf12'|'mailchimp_wf13'|'vinoshipper'|'stub'),
  updated_at

audience_bid_modifiers
  channel, audience_key, modifier_pct, rationale, active, updated_at

frequency_cap_view (materialized view, refreshed hourly)
  visitor_id/email, channel, impressions_7d, last_seen, capped_bool

attribution_dedup_log
  conversion_id (vinoshipper order id), winning_channel, contributing_channels jsonb,
  rule ('last_click_7d'|'incrementality_adjusted'), dedup_at

incrementality_tests
  id, name, channel, start_at, end_at, holdout_pct, status,
  control_conversions, exposed_conversions, lift_pct, p_value

pacing_forecast
  channel, month, budget_cents, spend_to_date_cents,
  projected_eom_spend_cents, on_pace_bool, computed_at

creative_fatigue
  creative_id, channel, impressions_7d, ctr_7d, ctr_30d_baseline,
  fatigue_score (0-1), computed_at

dayparting_recommendations
  channel, campaign_id, hour_of_day (0-23), day_of_week (0-6),
  recommended_bid_modifier_pct, basis_conversions, computed_at
```

### Edge functions (stub + cron)

- `kennel-signals-sync` — pulls Mailchimp WF-12/13 tags (when available) into `customer_signals`. For now seeds from Vinoshipper aggregates + a small stub set so the UI renders.
- `kennel-attribution-dedup` — runs nightly, applies last-click 7d across Meta/Google/Instacart against Vinoshipper actuals, writes `attribution_dedup_log`.
- `kennel-pacing` — daily; projects EOM spend per channel; emits an alert via `kennel-alert-dispatch` when `projected > 1.1 × budget`.
- `kennel-frequency-rollup` — hourly view refresh.

### UI

- **New "Signals" tab** (`/kennel/signals`): LTV distribution histogram, churn risk heatmap by state, frequency cap status table, pacing alerts list.
- **New "Attribution" tab** (`/kennel/attribution`): cross-channel True ROAS table (channels × period), dedup log table, incrementality tests panel with holdout sizing helper.
- Existing dashboard gets two new cards above the channel breakdown: "Pacing" (per-channel on-track/over) and "Frequency" (% audience above cap).

### Advanced triggers (scaffold only, no auto-apply)

- **Dayparting** card on each channel drill-down reads `dayparting_recommendations`.
- **Weather** hook: edge function `kennel-weather-trigger` accepts a daily forecast payload, writes recs tagged `basis='weather'`. No automation; appears in Recommendations queue for approval.
- **Creative fatigue** panel in Recommendations list using `creative_fatigue.fatigue_score`.

---

## PHASE 2C — Local Delivery Signal Loop (receivers stubbed)

### Edge functions (receivers, all `verify_jwt = false`, signed)

- `webhook-instacart-purchase` — accepts purchase events, writes to `local_delivery_events`, fans out to existing Meta CAPI + Google OCI helpers from Z3.
- `webhook-doordash`, `webhook-gopuff`, `webhook-ubereats` — same shape, platform-specific signature verification stubs with TODO comments and the doc link.

### Schema

```text
local_delivery_events
  id, platform, external_event_id (unique),
  customer_email_hash, sku, qty, revenue_cents,
  occurred_at, raw jsonb, processed_at, capi_status, oci_status
```

Surfaced in the Attribution tab as a "Local delivery" channel column (zeros until live).

---

## Documentation

Update `README.md` and add `docs/kennel-phase-2.md`:

- New edge function list + invocation patterns
- Required env vars / secrets (Twilio additions only — rest already present)
- `guardrail_baseline` + `guardrail_config` schema reference
- Where to change thresholds (Settings UI → falls back to `guardrail_config` row)
- Webhook receiver URLs + signature requirements for 2C platforms
- Alert payload contract

---

## Out of scope (call out for later)

- Real ML for churn / fatigue (current scoring is rules-based)
- Per-campaign kill switch (channel-level only in v1)
- Auto-execution of dayparting/weather recs (approval-only in v1)
- Two-way SMS (outbound ops alerts only — TCPA constraint respected)

---

**Approve and confirm the 6 values above, and I'll build 2A end-to-end first, then 2B scaffolds, then 2C receivers in a single pass.**
