## Goal

Make the Kennel feel like a live optimization cockpit: a one-click data refresh, sliders that tell the optimizer *how* to think (ROAS vs reach, risk, pace), and a predictive timeline that projects spend/revenue/ROAS forward. All three appear on the main dashboard and on each channel drill-down.

## What you'll see

### 1. Refresh button (main Kennel + Channels)
- New "Refresh" button next to the existing "Sync history" button.
- Fires a *light* sync (last 7 days only, all three ad platforms in parallel) plus `vinoshipper-poll`. Takes ~10–15s vs 1–2 min for the full backfill.
- Toast progress; auto-invalidates dashboard queries when done.
- Shows "Last refreshed Nm ago" badge next to it.

### 2. Strategy Mix panel
A new card at the top of the dashboard (and per-channel on the drill-down) with three sliders + one toggle:

| Control | Range | Effect on optimizer |
|---|---|---|
| **Goal** slider | Max ROAS ←→ Max Reach | Sets target ROAS floor (4.0x → 1.5x) and shifts pacing toward reach/impressions vs conversions |
| **Risk** slider | Conservative ←→ Aggressive | Confidence floor for auto-apply (0.95 → 0.70) and max single-day budget swing (±10% → ±40%) |
| **Pace** slider | Steady ←→ Burst | Daily spend cap multiplier (0.8x → 2.0x of baseline) |
| **Auto-apply** toggle | Off / On | Whether the optimizer applies its own recs without manual approval |

Saved to `ad_settings` as one row (`strategy_mode` key, jsonb). Scope = "global" on dashboard, "platform:<name>" on channels page. The existing `kennel-optimizer` edge function will read these on its next run.

### 3. Predictive Timeline
A new section with a 30/60/90-day forward projection chart:
- Lines: **Spend**, **Revenue**, **ROAS** (dual-axis).
- Shaded confidence band (lower/upper bound) around revenue.
- Toggle between platforms (or "All") on the dashboard view; locked to the current platform on drill-down.
- Backed by a new `kennel-forecast` edge function: pulls last 90 days from `ad_performance_daily`, fits a simple linear + 7-day seasonality model, writes results to the existing `ad_forecasts` table (already in schema, currently empty), reflects current Strategy Mix sliders in the projection (Goal slider tilts the revenue trajectory, Pace tilts spend).
- "Regenerate forecast" button next to the chart; auto-refreshes when sliders change (debounced).

## Technical notes

- **Tables used:** `ad_settings` (new key `strategy_mode`), `ad_forecasts` (already exists, currently empty), `ad_performance_daily` (read for forecast inputs).
- **New edge function:** `kennel-forecast` — POST `{ platform?, horizon_days }`, runs lightweight projection in TS (no Python needed), upserts rows into `ad_forecasts`.
- **New edge function:** `kennel-refresh-light` — fans out to the three existing ingest functions with `{ days: 7 }`, returns aggregate status. (Reuses what's already deployed.)
- **Optimizer integration:** Update `kennel-optimizer` to read `strategy_mode` from `ad_settings` and map it to the existing confidence floor / spend cap / target ROAS variables. No schema change to optimizer outputs.
- **Components added:**
  - `src/components/kennel/RefreshButton.tsx`
  - `src/components/kennel/StrategyMixPanel.tsx`
  - `src/components/kennel/ForecastTimeline.tsx`
- **Wiring:**
  - `KennelDashboard.tsx`: insert RefreshButton in header, StrategyMixPanel above AiInsights, ForecastTimeline above the channel breakdown.
  - `KennelChannelsPage.tsx`: insert RefreshButton in the drill-down header, StrategyMixPanel + ForecastTimeline scoped to the selected platform, visible at the campaign level.
- **Styling:** sharp edges, brand red accents, Nunito Sans — matches existing kennel cards.

## Out of scope (call out for later)

- ML-grade forecast (Prophet/Holt-Winters in Python). Starting with TS linear+seasonality is enough to show direction and confidence bands; can swap the model later without UI changes.
- Per-campaign sliders (only platform-level for now).
- Slider history / A/B comparison of strategy modes.

Approve and I'll build it.
