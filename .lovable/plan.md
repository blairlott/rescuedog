
# Autonomous Growth + Ops Buildout

## Recommendation for Phase 1 starting point: **Meta CAPI Lifecycle Events (#17)**

**Why this first:**
1. **Immediate ad ROI** — your Meta campaigns are currently optimizing on browser-side Pixel only. Server-side events (CAPI) recover ~15-30% of conversions lost to iOS tracking limits, ad blockers, and cookie loss. This pays for itself the day it ships.
2. **Foundation for #18, #19, #20, #21** — once we have a clean lifecycle event stream (Lead → ClubJoin → Shipment → Cancel → LTV milestone), the same payload powers Google Ads offline conversions, Mailchimp segmentation, audience builder, and lookalike triggers. Build the pipe once, fan it out.
3. **Already partially wired** — `meta-capi-lead` exists and fires from `useJoinClub`. We just need to add the other lifecycle events.
4. **Low risk** — pure server-to-server, no UI changes, easy to A/B and kill-switch.

## Autonomy model: Auto-execute with kill switch

Every autonomous action will follow this pattern:
- **Feature flag** in `app_settings` (e.g. `autonomy.ad_pause_enabled`) — flip to `false` = instant pause
- **Action log** in a new `autonomy_actions` table — every AI-initiated change recorded with rollback metadata
- **Rollback button** in CRM → Autonomy tab for any logged action
- **Daily digest** (#15) summarizes what ran overnight + lets staff one-click revert
- **Spend ceiling** — hard cap (e.g. $X/day) per channel; AI cannot exceed without human approval

## Phase order

```text
Phase 1 — Revenue infra (1-2 weeks)
  ├─ #17 Meta CAPI lifecycle events   ← START HERE
  ├─ #18 Google Ads offline conversions
  ├─ #19 Mailchimp auto-sync (segments)
  └─ #26 Abandoned cart recovery

Phase 2 — Team intelligence (1-2 weeks)
  ├─ #15 Daily AI ops digest (depends on Phase 1 data)
  ├─ #10 Churn dashboard + at-risk scoring
  ├─ #11 LTV / cohort revenue
  ├─ #12 Unified customer map (filterable: club / lapsed / VIP)
  ├─ #14 Ambassador performance (impact.com API)
  └─ #16 Webhook activity viewer

Phase 3 — Member experience (1-2 weeks)
  ├─ #1  VS member-portal deep-links for shipment customization
  ├─ #2  Shipment tracking page
  ├─ #3  "Your Pack" portal upgrades
  ├─ #4  Loyalty points via webhook on club shipments
  ├─ #5  Smart re-engagement automations
  ├─ #6  Club anniversary + birthday (deeper for members)
  ├─ #7  Referral program
  └─ #8  Tasting event RSVPs

Phase 4 — Autonomous marketing (2-3 weeks)
  ├─ #20 Audience builder → Custom Audiences
  ├─ #21 Lookalike triggers
  ├─ #22 Dynamic product ads feed
  ├─ #23 Auto-pause underperforming campaigns
  ├─ #24 AI creative variants
  └─ #25 SEO autopilot

Phase 5 — Close the loop
  ├─ Activate welcome series (currently gated to July 2026)
  ├─ Cancellation analytics dashboard
  └─ A/B framework dashboard
```

## Phase 1, feature #17 — what I'll build now

**Events to fire to Meta CAPI (server-side):**

| Event              | Trigger                                         | Value             |
|--------------------|-------------------------------------------------|-------------------|
| `Lead`             | Email captured (popup, footer, donation form)   | $0                |
| `CompleteRegistration` | Customer account created                    | $0                |
| `Subscribe`        | Wine club join (already partial — confirm)      | tier annual value |
| `Purchase`         | Vinoshipper webhook `ORDER APPROVED`            | order subtotal    |
| `StartTrial`       | First shipment dispatched                       | shipment value    |
| `CustomEvent: ClubCancelled` | `cancel-wine-club-membership` success | -LTV              |
| `CustomEvent: ShipmentSkipped` | `wine-club-shipment-save` w/ status=skipped | 0       |
| `CustomEvent: PaymentDeclined` | VS webhook `CARD_DECLINED`            | 0                 |
| `CustomEvent: LTVMilestone` | Customer LTV crosses $500 / $1k / $2.5k  | 0                 |

**Technical:**
- One reusable edge function `meta-capi-event` that takes `{event_name, event_id, user_data, custom_data}`
- All existing handlers (vinoshipper-webhook, cancel-wine-club-membership, etc.) call it best-effort, never throw
- Hash PII (email/phone/name/zip) with SHA-256 per Meta spec
- Include `fbc`/`fbp`/`client_ip_address`/`client_user_agent` for matching
- New table `meta_capi_events` (event_id, status, response, retry_count) for dedup + replay
- Kill switch: `app_settings.meta_capi_enabled` (default true)
- CRM admin page: `/crm/autonomy/meta-capi` shows last 100 events + retry button

## Technical notes (for the dev side)

- Reuse existing `src/lib/metaAttribution.ts` for fbc/fbp on client
- New helper `supabase/functions/_shared/metaCapi.ts` with `sendCapiEvent()`
- All lifecycle event_ids will be the row PK of the originating object (membership.id, order.id, etc.) so dedup is automatic
- Add `meta_capi_status` column to relevant tables for observability
- Webhook handlers stay synchronous to VS but fire CAPI async (no blocking)

## Phase 1 — shipped after #17

**Mailchimp wine club lifecycle sync**
- New shared helper `_shared/mailchimpMember.ts` (upsert + tag, MD5 hash, logs to `mailchimp_lifecycle_events`).
- New public edge fn `mailchimp-tag` (auth-required) for client triggers.
- `useWineClub.useJoinClub` tags `wine_club_active` + `wc_tier_*`, removes `wine_club_cancelled` / `exclude_active_30d`, sets merge fields `WCSTATUS/WCTIER/WCJOIN`.
- `cancel-wine-club-membership` removes `wine_club_active`, adds `wine_club_cancelled` + reason tag, sets `WCSTATUS=cancelled`, `WCCANCEL=date`.
- Kill switch: `app_settings.mailchimp_wine_club_sync_enabled`.

**Abandoned cart recovery (#26)**
- New table `abandoned_carts` (RLS: admin-read only) with snapshot, recovery counters, CAPI flag.
- `useAbandonedCartSnapshot` hook mounted in `AppContent` — debounced 8s, captures `_fbc`/`_fbp`/`gclaw` cookies.
- Edge fn `cart-snapshot` (auth-required) upserts/clears the snapshot.
- Edge fn `abandoned-cart-sweep` runs every 15 min via pg_cron `abandoned-cart-sweep-15min`:
  - Email 1 at ≥ 2h (`recovery_emails_sent = 0`)
  - Email 2 at ≥ 24h (`recovery_emails_sent = 1`)
  - Expire at 72h
  - Fires Meta CAPI `InitiateCheckout` once per cart on first email
- Kill switch: `app_settings.abandoned_cart_enabled`.

**Google Ads OCI lifecycle (#18) — shipped**
- New edge fn `google-ads-event` (auth-required) uploads a single offline conversion to Google Ads. Accepts `event_name`, `event_id`, `value`, `gclid`/`gclaw`, hashed `email`/`phone`. Respects `app_settings.kennel_oci_enabled` kill switch.
- Conversion action resolution order: explicit `conversion_action_id` → `google_ads_<event>_conversion_action_id` → `google_ads_subscribe_conversion_action_id` → `kennel_oci_conversion_action_id`.
- `useWineClub.useJoinClub` now fires `Subscribe` with predicted LTV (`computeWineClubSignupValue`) + reads the `gclaw` cookie for click match.
- Purchase OCI already covered by `vinoshipper-conversions-backfill` (15-min poll, hashed user_identifiers).
- Logs every attempt to `oci_upload_log` with status `uploaded` / `partial_failure` / `error` / `skipped_no_identifier`.

**Phase 2 batch 1 — shipped (#15 + #10 + #11)**
- New edge fn `customer-cohorts-rebuild`: pages through `vs_transactions`, joins club status, computes per-email LTV, AOV, days-since-last-order, banded churn probability, segment (champion/loyal/regular/club_member/at_risk/lost/one_time), predicted 24-mo LTV. Upserts into `customer_cohorts` (already RLS'd to executives + ad ops).
- New edge fn `ops-daily-digest`: composes yesterday's revenue, club joins/cancels, CAPI/OCI volume, open abandoned carts, top at-risk customers — and emails via Resend connector to the addresses in `app_settings.ops_digest_recipients`. Logs each run to new `ops_digest_runs` table.
- New CRM page `/crm/intelligence` (admin-only nav link "Intelligence"): KPI cards (customers, realized LTV, predicted LTV, at-risk count, club/champion count), segment breakdown, top at-risk table, LTV-by-acquisition-month cohort matrix, recent digests log. "Rebuild cohorts" + "Send digest now" buttons for on-demand runs.
- Cron: `customer-cohorts-rebuild-nightly` (04:15 UTC daily) + `ops-daily-digest` (13:00 UTC daily ≈ 8am EST).
- Kill switch: `ops_digest_enabled`.

**Phase 2 batch 2 — shipped (#12 + #14 + #16)**
- New CRM page `/crm/customer-map` (admin-only): leaflet US map with state-level bubble overlays from `customer_cohorts`. Segment chips (champion / loyal / club_member / regular / at_risk / lost / one_time), min-LTV input, "club members only" toggle. Bubbles sized by customer count, colored by dominant segment per state. Centroid lookup in new `src/lib/usStateCentroids.ts`.
- New `AmbassadorPerformanceTable` mounted inside `CrmAmbassadorsPage`: 30 / 90 / 365-day rollup of `impact_events` per ambassador (attributed orders, bottles, rescue donation $). Sorted by donation desc with a totals row.
- New CRM page `/crm/webhooks` (admin-only): last 200 `vinoshipper_webhook_events` with filters (all / unprocessed / errors), payload expand, and a "Re-queue" button that flips `processed=false` so the next sweep retries it. RLS already covers admins via `is_wine_club_manager`.
- CRM sidebar got two new admin links: "Customer Map" (Globe2) and "Webhooks" (Webhook).

**Phase 3 batch 1 — shipped (#1 + #2 + #3)**
- **VS member-portal deep-links (#1)** — `src/lib/vinoshipperPortal.ts` exposes canonical Vinoshipper portal URLs (overview, payment methods, addresses, orders, subscriptions, preferences). New `VinoshipperPortalPanel` component mounted on the member dashboard with one-tap deep-links into the compliance-grade VS account portal for card-on-file updates, address changes, and subscription edits — opens in a new tab.
- **Shipment tracking (#2)** — new `/account/shipments` list + `/account/shipments/:id` detail page (`MyShipmentsPage.tsx`). Pulls `wine_club_shipments` + items for the signed-in user, shows status badges, total, and item list. `src/lib/carrierTracking.ts` auto-detects UPS / FedEx / USPS / DHL from the tracking number and surfaces the carrier-specific "Track Package" CTA. Falls back to a Google search for unknown patterns.
- **Your Pack portal (#3)** — new `YourPackStats` card on the member dashboard showing lifetime shipments received, bottles enjoyed, and Pack points + tier from `loyalty_accounts`. Added "View Shipment History & Tracking" CTA linking into the new shipments page.

**Phase 3 batch 2 — shipped (#4 + #5 + #6)**
- **Loyalty on shipments (#4)** — `vinoshipper-webhook` now awards loyalty points the first time a shipment transitions to `shipped` (TRACKING_NUMBER event). Service-role calls `award-loyalty-points` with `subtotal_cents = shipment.total_cents`, deduped through new `wine_club_shipment_loyalty_log` (UNIQUE on `shipment_id`). Kill switch: `app_settings.wine_club_shipment_loyalty_enabled`.
- **Re-engagement sweep (#5)** — new edge fn `reengagement-sweep` runs daily (cron `reengagement-sweep-daily`, 09:00 UTC). Reads `customer_cohorts`, maps segment → Mailchimp tag (`at_risk → reengage_at_risk`, `lost → reengage_lost`, `one_time → reengage_one_time`), with 30-day throttle per email+tag via `reengagement_log`. Mailchimp automations fire the actual winback emails. Kill switch: `reengagement_sweep_enabled`.
- **Anniversary sweep (#6)** — new edge fn `anniversary-sweep` runs daily (cron `anniversary-sweep-daily`, 13:30 UTC). Finds active memberships whose `joined_at` month/day matches today, awards `anniversary_bonus_points_per_year × years` loyalty points (default 100/yr) and tags Mailchimp with `wc_anniversary_today` + `wc_anniv_{years}yr`. Idempotent via `wine_club_anniversary_log` UNIQUE on (membership_id, anniversary_year). Kill switch: `anniversary_sweep_enabled`. Birthday email deferred — `profiles` has no birthday field; can layer in once we capture DOB at signup.

**Phase 3 batch 3 — shipped (#7 + #8)**
- **Referral program (#7)** — new edge fn `referral-approve` (admin-only, JWT-verified via `is_admin_or_owner`). When an admin approves a pending row in `referral_rewards`, the function now *actually* awards loyalty points to BOTH parties via service-role `award-loyalty-points` calls (idempotent via `order_id = referral_{id}_{role}`), tags the referrer (`referrer_active`) and the referred customer (`referral_completed`) in Mailchimp, and writes the approval back to `referral_rewards`. `ReferralAdminTab.tsx` now invokes the edge fn instead of the previous direct UPDATE (which only wrote virtual point counters and never credited balances). Reject path also goes through the fn for consistent auditing. Configurable default points via `app_settings.referral_default_points`.
- **Tasting event RSVPs (#8)** — two new edge fns wire the existing `ambassador_event_rsvps` table to real customer touchpoints:
  - `event-rsvp-confirm` — invoked from `AmbassadorEventPublicPage` right after the RSVP row is inserted. Sends a branded confirmation email via Resend (date, location, party size, event link). Kill switch: `event_rsvp_confirmation_enabled`.
  - `event-reminder-sweep` — new daily cron `event-reminder-sweep-daily` (15:00 UTC). Finds published events starting 20-36h from now and emails every RSVP a "see you tomorrow" reminder. Kill switch: `event_reminder_enabled`.
  - Dedup table `event_rsvp_email_log` with UNIQUE `(rsvp_id, kind)` so confirmations and reminders fire at most once per RSVP. Admin/ambassador-manager read-only.

**Next up:** Phase 4 — Autonomous marketing (audience builder #20, lookalike triggers #21, dynamic product ads feed #22, auto-pause underperforming campaigns #23).
