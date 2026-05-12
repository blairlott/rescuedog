# Automated Curation, Shipment Lifecycle, Weather Holds, UPS Access Points

Replaces the manual Vinoshipper curation/notification process. Cadence anchored to **Monday ship days, Sunday-night customization cutoff**.

---

## Cadence rules (applies everywhere)

- Ship day = Monday.
- Customization deadline (`cutoff_at`) = Sunday 11:59 PM ET (the day before ship day).
- Heads-up "preview & customize" email = Tuesday morning of the prior week (≈6 days before cutoff).
- Lock + final reminder = Sunday 8 AM ET.
- Auto-dispatch to Vinoshipper = Monday 7 AM ET.

These thresholds live in a `wine_club_settings` row so admins can adjust without code.

---

## 1. Seasonal AI curation (manager-assisted)

Wine club manager kicks off a curation run; AI proposes picks per tier; manager approves; picks auto-fill upcoming shipments.

### Schema
- `wine_club_curation_runs` — id, season, ship_window_start, ship_window_end, status (`draft|proposed|approved|published|cancelled`), created_by, approved_by, ai_model, notes.
- `wine_club_curation_picks` — id, run_id, tier_id, wine_product_id, quantity, role (`hero|pairing|stretch`), ai_rationale, sort_order.
- `wine_club_settings` — singleton: ship_dow (default 1 = Monday), cutoff_offset_days (default 1), preview_email_offset_days (default 7), dispatch_hour_local, timezone.

### Edge fn `wine-club-generate-curation`
- Pulls active wine catalog + tags/tasting notes + each tier's `bottle_count`/`wine_type`.
- Lovable AI Gateway (`google/gemini-2.5-pro`) prompt: pick N bottles, balance varietals, prefer in-season styles (rosé/whites in summer, bold reds in fall/winter, sparkling for holiday), respect tier `wine_type`.
- Writes picks per tier; run `status='proposed'`.

### Manager UI: `/crm/wine-club` → "Curation" tab
- "New seasonal run" → choose season + ship window → invokes generate-curation.
- Per-tier pick list with rationale + swap from catalog.
- "Approve & publish" → status `published` → for each active app-originated membership matching tier with no `customer_customized` shipment in window, seed a `wine_club_shipments` row (status `scheduled`, `shipment_date` = next Monday in window, `cutoff_at` = Sunday 23:59 ET prior).

---

## 2. Customization heads-up emails + cutoff

### Schema additions on `wine_club_shipments`
- `customer_notified_at` timestamptz
- `cutoff_at` timestamptz (Sunday 23:59 ET before `shipment_date`)
- `weather_hold_state` text NULL
- `weather_hold_until` date NULL
- `delivery_destination_type` text DEFAULT `'address'` — `'address'|'ups_access_point'`
- `delivery_ups_access_point` jsonb NULL

### Inngest scheduled jobs
- `wine-club-send-preview-emails` (Tuesday 09:00 ET): for shipments with `status='scheduled'`, `customer_notified_at IS NULL`, and `cutoff_at` within next 7 days → send preview email → mark notified, status `customer_notified`.
- `wine-club-final-reminder` (Sunday 09:00 ET): one last "your shipment locks tonight" nudge to anyone who hasn't customized and hasn't skipped.
- `wine-club-lock-shipments` (Monday 00:30 ET, after cutoff): set status `locked`, send "your shipment is locked" confirmation.

### Email templates (new)
- `wine-club-shipment-preview.tsx`
- `wine-club-shipment-final-reminder.tsx`
- `wine-club-shipment-locked.tsx`
- `wine-club-weather-hold.tsx`
- `wine-club-shipment-released.tsx`
- `wine-club-shipment-dispatched.tsx`

---

## 3. Auto-trigger Monday shipments

### Edge fn `wine-club-dispatch-shipment`
- Reads a single locked shipment, checks no active weather hold for ship-to state, calls `vinoshipper-create-order` with items + `vinoshipper_customer_id` + chosen destination (address OR UPS access point).
- Success → status `shipped`, store `vinoshipper_order_id`, send dispatched email, write `wine_club_events` row.
- Failure → status stays `locked`, log `dispatch_failed`, retry next cron.

### Inngest cron `wine-club-auto-dispatch` (Monday 07:00 ET)
- For shipments where `status='locked'` and `shipment_date = today` and no weather hold → invoke dispatch.

Manager UI: "Pending dispatch" queue with manual override + retry.

---

## 4. Weather holds by state

### Schema
- `wine_club_weather_holds` — id, state (2-letter), hold_until date, severity (`heat|freeze|storm`), reason text, created_by, created_at, lifted_at, customer_notified_at.

### Manager UI: `/crm/wine-club` → "Weather Holds" tab
- Add hold: state + until-date + reason (multi-state supported).
- Live list with "Lift now".
- Create → enqueue notify-on-hold; lift → enqueue notify-on-release.

### Enforcement
- `wine-club-auto-dispatch` skips any shipment whose `shipping_state` matches an active hold; flips status to `weather_hold`, stamps `weather_hold_state` + `weather_hold_until`, sends weather-hold email once.
- Daily check: when hold lifts, `weather_hold` shipments for that state revert to `locked`, get released-email + re-queued for next Monday's dispatch.

---

## 5. UPS Access Point delivery option

### Member dashboard
- "Delivery destination" panel atop `NextShipmentCustomizer`:
  - Radio: `Ship to my address` (default) | `Ship to a UPS Access Point`.
  - Access Point chosen → ZIP-based search.
  - Search calls edge fn `ups-access-point-search` (UPS Locator API; needs `UPS_CLIENT_ID` + `UPS_CLIENT_SECRET`).
  - Selected location displayed; saved to shipment via `wine-club-shipment-save`.
- Optional default on `customer_profiles.default_ups_access_point` jsonb so future shipments pre-fill.

### Dispatch
- `wine-club-dispatch-shipment` passes access-point info to Vinoshipper as ship-to with "Hold for Pickup" flag.

### Compliance reminder
- Disclaimer copy: "Adult signature 21+ still required at the UPS Access Point. Bring a valid government-issued ID matching the order name."

---

## Inngest

Single serve endpoint `/functions/v1/inngest`. Functions:
`wine-club-create-cycle`, `wine-club-send-preview-emails`, `wine-club-final-reminder`, `wine-club-lock-shipments`, `wine-club-auto-dispatch`, `wine-club/hold.created`, `wine-club/hold.lifted`.
Manager can trigger any of these manually from the admin tab.

If Inngest isn't connected yet, fall back to `pg_cron` + `pg_net`. I'll prompt to connect Inngest when we get to that step.

---

## Build order

1. Migration: curation tables, shipment columns (cutoff_at, customer_notified_at, weather_hold_*, delivery_destination_type, delivery_ups_access_point), weather holds table, `wine_club_settings` singleton, RLS.
2. `wine-club-generate-curation` edge fn + Curation tab UI.
3. Publish flow → seeds Monday shipments with Sunday cutoffs.
4. Resend templates + Inngest preview/final-reminder/lock crons.
5. Weather holds schema + UI + dispatch enforcement + emails.
6. UPS access-point edge fn + member-side selector + persist + Vinoshipper hand-off.
7. `wine-club-dispatch-shipment` + Monday auto-dispatch + manager queue.
8. Memory: update `wine-club-customization`, add `wine-club-automation`.

## Out of scope

- Fully autonomous AI publishing without manager approval.
- Auto-creating weather holds from forecast data.
- Legacy VS member migration into this pipeline.
- Payment/billing changes — Vinoshipper still charges.
