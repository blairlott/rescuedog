# Meta Purchase Autopilot — Auto-Stop + Guarded Re-enable

Port the proven Instacart autopilot pattern to Meta purchase campaigns. Same guardrails (error-rate + ROAS thresholds, daily action cap, allowed-actions whitelist), same kill-switch evaluation log, same guarded re-enable flow (typed confirmation + cooldown), plus a Meta-specific health UI.

## What gets built

**1. New edge function: `meta-ads-execute`**
The Instacart pattern needs an executor; Meta doesn't have one yet. This function takes an action (`pause_campaign`, `resume_campaign`, `adjust_daily_budget`) + a `campaign_id`, calls the Meta Marketing API (`act_<META_ADS_ACCOUNT_ID>/campaigns/{id}`), and logs the result to `ad_execution_log`. Uses existing `META_ADS_ACCESS_TOKEN` + `META_ADS_ACCOUNT_ID` secrets. Budget changes are capped by `meta_autopilot_max_budget_change_pct`.

**2. New edge function: `meta-autopilot`**
Mirrors `instacart-autopilot` structure:
- Loads settings from `app_settings` (see schema below).
- Pulls pending `ad_recommendations` for `platform='meta'`, filters by confidence + allowed actions + B2B mode.
- Evaluates two kill switches *before* executing anything:
  - **Error rate**: % failed Meta executions in the last N actions vs `meta_autopilot_max_error_rate_pct`.
  - **Trailing Purchase ROAS**: `ad_performance_facts` rolled up over `meta_autopilot_roas_window_days`, compared to `meta_autopilot_min_roas` (default 2.0 — breakeven on 50% margin).
- Every evaluation (window, failures, computed ROAS, spend, sales) writes a row to `ad_autopilot_kill_switch_evaluations` with `platform='meta'`.
- If a switch trips: flip `meta_autopilot_enabled=false`, write `ad_autopilot_evaluations` row, send auto-stop email to admins via `send-transactional-email` (new `meta-autopilot-auto-stop` template).
- If healthy: execute up to `meta_autopilot_daily_action_cap` recommendations via `meta-ads-execute`.

**3. New `app_settings` keys** (defaults shown)
- `meta_autopilot_enabled` = false
- `meta_autopilot_confidence_min` = 0.75
- `meta_autopilot_max_budget_change_pct` = 20
- `meta_autopilot_daily_action_cap` = 10
- `meta_autopilot_allowed_actions` = `["pause_campaign","adjust_daily_budget"]`
- `meta_autopilot_max_error_rate_pct` = 25
- `meta_autopilot_error_rate_window` = 50
- `meta_autopilot_min_roas` = 2.0
- `meta_autopilot_roas_window_days` = 7
- `meta_autopilot_min_actions_for_eval` = 10
- `meta_autopilot_cooldown_minutes` = 60
- `meta_autopilot_notify_emails` = []

**4. Cron** (07:30 UTC, after Meta ingest)
Schedules `meta-autopilot` via `pg_cron` + `pg_net`, matching Instacart's cadence.

**5. UI: `MetaAutopilotHealth` component**
New file `src/components/kennel/MetaAutopilotHealth.tsx`, modeled on `InstacartAutopilotHealth`:
- Risk tile (HEALTHY / AT RISK / WILL STOP / AUTO-STOPPED) driven by latest `ad_autopilot_evaluations` row.
- Kill-switch evaluation log table (last 50 from `ad_autopilot_kill_switch_evaluations` where `platform='meta'`).
- Guarded re-enable: typed confirmation ("RE-ENABLE META AUTOPILOT") + acknowledgement checkbox + cooldown countdown.
- Settings card for thresholds + cap + cooldown.
- Mount on `KennelChannelsPage` (or a new `KennelMetaAdsPage` mirroring Instacart — see note below).

**6. Auto-stop email template**
`supabase/functions/_shared/transactional-email-templates/meta-autopilot-auto-stop.tsx` — same structure as the Instacart one, with reason, measured metrics, and re-enable steps. Registered in `registry.ts`.

## Technical notes

- **No schema migration needed** — `ad_autopilot_kill_switch_evaluations` and `ad_autopilot_evaluations` already have a `platform` column; we just write `'meta'` rows.
- **Meta Marketing API auth**: use `META_ADS_ACCESS_TOKEN` (system-user token already in secrets). Endpoint pattern: `POST https://graph.facebook.com/v21.0/{campaign_id}?status=PAUSED&access_token=...`. Budget changes go to `/{campaign_id}?daily_budget={cents}`.
- **B2B handling**: Meta doesn't have a native B2B flag the way Instacart does, so we treat any campaign with `metadata.b2b=true` or objective matching `/b2b|wholesale|trade/i` the same way (lower per-day cap, stricter budget delta).
- **Idempotency**: each Meta execution writes to `ad_execution_log` with the recommendation id; retries are no-ops if already executed.
- **Decision to mount UI**: simplest is to drop `MetaAutopilotHealth` onto an existing page (`KennelChannelsPage` or `KennelMediaBuyingPage`). A dedicated `KennelMetaAdsPage` mirroring Instacart's page is cleaner long-term but adds a route + nav entry. **I'll mount it on `KennelChannelsPage` unless you'd rather have a dedicated page.**

## Out of scope (call out so we don't sneak it in)

- No changes to existing CAPI / pixel / ingest functions.
- No new Meta API permissions request — uses tokens already in place.
- No automated EMQ scraping (Meta still doesn't expose it via API).
- Doesn't touch the consumer wine ad-set structure or budgets directly; only acts on `ad_recommendations` you already approve via the pipeline.

## Files touched

- `supabase/functions/meta-ads-execute/index.ts` (new)
- `supabase/functions/meta-autopilot/index.ts` (new)
- `supabase/functions/_shared/transactional-email-templates/meta-autopilot-auto-stop.tsx` (new)
- `supabase/functions/_shared/transactional-email-templates/registry.ts` (edit)
- `src/components/kennel/MetaAutopilotHealth.tsx` (new)
- `src/pages/kennel/KennelChannelsPage.tsx` (mount panel)
- `app_settings` rows seeded via insert (not migration — it's data)
- `pg_cron` schedule entry via insert

Approve and I'll build it end-to-end.
