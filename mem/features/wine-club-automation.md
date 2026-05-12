---
name: Wine Club Automation
description: Monday-ship cadence, AI seasonal curation, lifecycle emails, weather holds by state, UPS Access Point delivery, auto-dispatch.
type: feature
---
**Cadence (in `wine_club_settings` singleton):** Monday ship day, Sunday 23:59 ET cutoff, preview email ~6 days before cutoff, auto-dispatch Monday 7am ET.

**Tables:**
- `wine_club_curation_runs` + `wine_club_curation_picks` — manager-approved seasonal AI picks per tier.
- `wine_club_weather_holds` — by US state, with hold_until + reason; enforced in dispatch.
- `wine_club_settings` — operational thresholds.
- New cols on `wine_club_shipments`: `cutoff_at`, `customer_notified_at`, `final_reminder_sent_at`, `weather_hold_state`, `weather_hold_until`, `delivery_destination_type` (`address`|`ups_access_point`), `delivery_ups_access_point` jsonb, `dispatched_at`, `dispatch_error`, `curation_run_id`.
- `customer_profiles.default_ups_access_point` jsonb.

**Edge functions:**
- `wine-club-generate-curation` — Lovable AI Gateway (`google/gemini-2.5-pro`) proposes per-tier picks for a season + ship window.
- `wine-club-publish-curation` — manager approves; seeds `wine_club_shipments` (status `scheduled`) with next-Monday `shipment_date` and Sunday `cutoff_at` for every active app-originated membership matching the tier.
- `wine-club-cron-tick` — single idempotent tick: sends preview emails, locks past-cutoff shipments (or flips to `weather_hold`), releases shipments whose hold lifted, dispatches Monday's locked shipments.
- `wine-club-dispatch-shipment` — calls `vinoshipper-create-order` with address OR access-point ship-to (Hold for Pickup), records `vinoshipper_order_id`, sends dispatched email.
- `ups-access-point-search` — UPS Locator API (or simulated fallback when `UPS_CLIENT_ID`/`UPS_CLIENT_SECRET` not set).
- `wine-club-shipment-save` — accepts `delivery_destination_type` + `delivery_ups_access_point` payload from member.

**Email templates expected** (route via `send-transactional-email`): `wine-club-shipment-preview`, `wine-club-shipment-locked`, `wine-club-weather-hold`, `wine-club-shipment-released`, `wine-club-shipment-dispatched`.

**Still TODO (next iteration):** manager UI tabs for Curation, Weather Holds, and Pending Dispatch on `/crm/wine-club`; pg_cron schedule for `wine-club-cron-tick` (hourly); concrete Resend templates; optional `UPS_CLIENT_ID`/`UPS_CLIENT_SECRET` secrets to flip UPS lookup from simulated to live.

**Member UI:** `NextShipmentCustomizer` now shows delivery destination toggle + UPS Access Point ZIP search; selection saved with the shipment.
