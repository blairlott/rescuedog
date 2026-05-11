# Rescue Ambassadors Program — Phase 1 + Tasting Events

A single-tier ambassador program (no MLM downline yet) that lets approved supporters share Rescue Dog Wines via a personal storefront and earn commission on attributed orders. Adds a tasting-event host mechanic borrowed from Traveling Vineyard.

## Scope

**In:** ambassador signup/approval, vanity storefront pages, order attribution, ambassador dashboard, tasting-event host pages, public "Find an Ambassador" directory, FTC income disclosure page, admin management in CRM.

**Out (deferred to later phases):** multi-level downline, automated payouts (Stripe Connect), 1099 generation, marketing asset library, mobile back-office app.

## User-facing experience

### For prospective ambassadors
- New page `/ambassadors` explains the program: rescue mission, commission %, how it works, FAQ, FTC disclosure link.
- "Apply to be a Rescue Ambassador" form → submits to admin queue.

### For approved ambassadors
- `/a/{handle}` — public vanity storefront with photo, bio, chosen rescue partner, social links, full wine catalog, embedded "Shop with [Name]" CTA. Visiting this URL drops a 30-day attribution cookie.
- `/ambassador/dashboard` — private: total sales attributed, customer count, commission accrued (display-only, manual payout for now), copy-share link button, edit profile.
- `/ambassador/events/new` — create a tasting-event page.
- `/e/{event-slug}` — public host event page: event name, host bio, date/time, address, RSVP form, "Shop the Tasting" CTA. Orders during the event window are double-attributed (event + ambassador).

### For customers
- Header chip on any `/a/{handle}` or `/e/{slug}` visit: "Shopping with [Ambassador Name] — supports [Rescue Partner]" with dismiss link.
- Optional "Got a referral code?" field at checkout (Vinoshipper handoff already supports order metadata).

### For admins (in CRM)
- New `/crm/ambassadors` tab: pending applications (approve/deny), active ambassadors (sales, last activity), event list, commission ledger export.

## Database schema (new tables)

| Table | Purpose |
|---|---|
| `ambassadors` | profile per ambassador: user_id, handle, display_name, bio, avatar_url, chosen_rescue_id, social_links jsonb, status (pending/active/paused/terminated), commission_rate, joined_at |
| `ambassador_applications` | signup form rows: name, email, why, social, status, reviewed_by, reviewed_at |
| `ambassador_attributions` | log when a vanity link / event link is visited: ambassador_id, event_id, visitor_id (cookie), ip, user_agent, occurred_at |
| `ambassador_orders` | attributed orders: ambassador_id, event_id, customer_email, vinoshipper_order_id, subtotal_cents, commission_cents, status (pending/confirmed/paid/voided), occurred_at |
| `ambassador_events` | tasting events: ambassador_id, slug, title, description, host_bio, address, starts_at, ends_at, rsvp_count, status |
| `ambassador_event_rsvps` | RSVP captures: event_id, name, email, party_size, notes |

All tables get RLS:
- Ambassadors can read/write only their own rows.
- Public can read approved ambassador profiles and active events.
- Admins (existing `is_admin_or_owner`) full access.

A new `app_role` enum value `ambassador` is added; `has_role(user_id, 'ambassador')` gates the dashboard.

## Attribution flow (technical detail)

```text
Visit /a/jane → set cookie rdw_amb=jane (30d) + insert ambassador_attributions row
Visit /e/spring-tasting → cookie rdw_amb=jane, rdw_evt=spring-tasting (event TTL)
Click "Buy" → Vinoshipper deep-link with ?ref=jane&evt=spring-tasting in metadata params
Vinoshipper webhook fires → existing webhook handler reads ref/evt → inserts ambassador_orders row
Commission = subtotal * ambassadors.commission_rate (default 15%, owner can override per-ambassador)
```

The Vinoshipper webhook handler already exists (`vinoshipper_webhook_logs`); we extend it to parse the `ref` parameter from the order's referrer URL or notes field.

## Edge functions

- `ambassador-apply` — public POST, inserts into `ambassador_applications`, emails admin via Resend.
- `ambassador-approve` — admin-only POST, creates auth user + `ambassadors` row + sends welcome email with login link.
- `ambassador-attribute` — public POST called from `/a/:handle` and `/e/:slug` page loads, logs attribution row.
- `vinoshipper-webhook` (existing) — extended to parse `ref` and create `ambassador_orders`.
- `event-rsvp` — public POST, captures RSVP, emails host + attendee confirmation.

## Routes added

| Route | Auth | Purpose |
|---|---|---|
| `/ambassadors` | public | program landing + apply |
| `/ambassadors/disclosure` | public | FTC income disclosure |
| `/ambassadors/find` | public | searchable directory |
| `/a/:handle` | public | ambassador storefront |
| `/e/:slug` | public | event host page |
| `/ambassador/dashboard` | ambassador | sales, link, profile |
| `/ambassador/events/new` | ambassador | create event |
| `/ambassador/events/:id/edit` | ambassador | edit event |
| `/crm/ambassadors` | admin | manage program |

## Brand & UX

- Sharp edges, red `#c30017`/black/grey, Nunito Sans headings, Avenir Next body — same as the rest of the site.
- Storefront cards lean editorial: hero photo + bio quote + "Why I support [Rescue]" + product grid.
- "Shopping with Jane" persistent banner uses the existing CartMarketing pattern.

## Build order (execution sequence)

1. Migration: enum value `ambassador`, all 6 tables, RLS policies, helper function `is_ambassador(uuid)`.
2. Public `/ambassadors` landing + application form + edge function `ambassador-apply`.
3. Admin `/crm/ambassadors` queue: approve/deny, view roster.
4. `/a/:handle` storefront + attribution cookie + edge function `ambassador-attribute`.
5. Ambassador `/ambassador/dashboard` (sales, link, profile edit).
6. Tasting events: `/ambassador/events/new`, `/e/:slug`, RSVP + `event-rsvp` function.
7. Extend Vinoshipper webhook to parse `ref`/`evt` and write `ambassador_orders`.
8. FTC disclosure page + "Find an Ambassador" directory.
9. Memory updates and QA pass.

## Compliance notes

- FTC disclosure page is mandatory and linked from every ambassador-facing page.
- No income claims anywhere except the disclosure (which shows real data once we have it; until then, "data not yet available — program newly launched").
- "Drink responsibly, 21+" + state shipping caveats already handled by Vinoshipper.
- Commission payouts handled manually for now (CSV export from CRM); Stripe Connect deferred.

## Risks / open questions

- **Vinoshipper attribution:** confirm we can pass a `ref` parameter through the deep-link and read it back from the webhook. If not, fall back to coupon-code-per-ambassador (less elegant but works).
- **Email approval:** uses existing Resend integration; admin email recipient configured via existing pattern.
- **Ambassador login:** approved ambassadors get a regular Supabase auth account; the `ambassador` role gates dashboard access (same pattern as CRM).
