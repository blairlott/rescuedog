
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
