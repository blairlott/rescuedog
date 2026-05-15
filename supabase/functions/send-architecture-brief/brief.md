# Rescue Dog Wines — Architecture & Functionality Brief
**Prepared for:** Lindy + Claude API review / QA
**Status:** Publishing soon for **internal review and QA only**. The published URL will **not be DNS-connected** and **not customer-facing**. No live wine purchases, no real payment capture, no production email sends to customers during this phase.

---

## 1. High-Level Overview

Rescue Dog Wines (RDW) is a dual-brand direct-to-consumer platform:

- **Wine site** (rescuedogwines.com) — age-gated, compliance-bound DTC wine catalog with a custom Wine Club, Subscribe & Save, Wholesale (B2B), Donations, Rescue Partner content, and a Sales CRM.
- **Merch site** (`/merch` route, eventually rescuedog.com) — non-age-gated apparel/accessories powered by headless Shopify.

Mission framing throughout: *"helping dogs find their forever home."* Qualitative only — no impact counters, totals, or quantified claims surface anywhere in the UI until verified data exists.

Brand: Red `#c30017`, Black, Grey. Nunito Sans + Avenir Next. Flat / sharp edges (`border-radius: 0`).

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript 5 + Tailwind v3 + shadcn/ui |
| Routing | React Router (SPA) |
| State | Zustand stores (cart, checkout intent), TanStack Query for server cache |
| Backend | Lovable Cloud (managed Supabase): Postgres, Auth, Storage, Edge Functions (Deno), pgmq queues, pg_cron |
| Wine catalog | Supabase `wine_products` table |
| Merch catalog | **Headless Shopify** via Storefront API 2025-07 |
| Wine checkout | Vinoshipper deep-link handoff (compliance + payment) |
| Merch checkout | Shopify cart `checkoutUrl` (opens new tab, `channel=online_store`) |
| Email | Lovable Email (`notify.rescuedog.com`) — pgmq-backed queue, React Email templates |
| AI | Lovable AI Gateway (Gemini + GPT-5 family) for sommelier chat, curation, translation |
| Maps | Leaflet (public) + Google Maps (CRM) |
| Analytics | GA4 + Meta CAPI (server-side conversions) |
| i18n | i18next (en, es, fr) |

Key constraint: client-side React only. No Next.js, no Node server. All server logic lives in Supabase Edge Functions.

---

## 3. Compliance & Age Gating

- **Age gate modal** required for every wine route. Stored in localStorage with expiry. Bypassed for `/merch`, `/crm`, `/cms`.
- **Wine shipping states**: hard-coded allowlist; checkout blocks restricted states with a clear "we can't ship to {state}" message.
- **Loyalty redemptions**: blocked in 14 states (UT, PA, MS, AL, TN, TX, NC, KY, MA, CT, NY, MI, IN, MO) — enforced server-side in `redeem_loyalty_points` RPC.
- **Tied-house compliance**: rescue partner mentions are editorial only — no quid-pro-quo, no donation amounts tied to specific retailers.
- **Adult signature required (21+)** disclosed on every wine product, cart, and checkout step.
- Vinoshipper handles state-by-state license, tax, and carrier compliance at the moment of payment.

---

## 4. Catalog Architecture

### Wine
- Single source of truth: Supabase `wine_products`.
- Strict sort order on Shop page (memorized in project memory — sampler/club tiers first, then varietal groupings).
- Wine Club Price displayed alongside retail; sampler disclaimer rendered when applicable.
- Award badges auto-styled from Shopify-style tags (e.g., `award:gold-90+`).

### Merch
- Headless Shopify Storefront API.
- Unified `ShopifyProduct` adapter normalizes wine and merch into one shape for shared UI components (cards, search, recommendations).
- **Dual-rail cart**: wine line items and merch line items live in separate rails inside the same `CartDrawer` because they check out through different systems.

---

## 5. Cart & Checkout

- `cartStore` (Zustand) — persisted across reloads, holds both rails.
- `CartDrawer` shows two clearly-labeled sections.
- Marketing copy rule (enforced everywhere): **never "free shipping"** — always **"shipping included"**.
- Cross-sell strips: "Pair wine with merch", "Merch for wine lovers", post-purchase upsell, exit-intent offer.
- Wine checkout → builds Vinoshipper deep-link with cart contents + customer state, opens Vinoshipper hosted flow.
- Merch checkout → Shopify `checkoutUrl` opened in new tab.
- `unified-checkout` Edge Function exists for future single-flow scenarios but is not the live path.

---

## 6. Customer Accounts

Routes: `/account` (customer), `/wine-club` (member), `/crm` (staff), `/cms` (editor), `/dropship` (partner), `/ambassadors` (affiliate).

Each surface has its own login + password reset page. All share Supabase Auth under the hood.

Customer account tabs:
- My Rescue (favorited rescue partners — capped at 5 via DB trigger)
- Wine Club Management
- Subscribe & Save
- Gift Certificates
- Payment Methods
- Rescue Rewards (loyalty)

---

## 7. Wine Club (custom build, replaces Vinoshipper club)

- Tiered membership (configured in `ClubConfigurator`).
- Member dashboard shows next shipment, can customize via `NextShipmentCustomizer` until cutoff.
- Cron tick (`wine-club-cron-tick`) runs scheduled jobs:
  - `wine-club-generate-curation` — AI-assisted shipment curation
  - `wine-club-publish-curation` — locks curation, opens customization window
  - `wine-club-dispatch-shipment` — finalizes shipment, sends to Vinoshipper for fulfillment
- Membership actions (`wine-club-membership-action`): pause, skip, cancel, change tier, change frequency.
- Loyalty positioned as **access-based ("The Pack")** — never a percentage discount.

---

## 8. Subscribe & Save

- Per-product subscription separate from Wine Club.
- `wine-subscription-action` Edge Function handles pause/skip/cancel/update-cadence.
- Uses Vinoshipper recurring orders under the hood.

---

## 9. Wholesale (B2B)

- `/wholesale` page with region-aware form.
- On submit → `send-wholesale-notification` Edge Function:
  - Routes admin notification to the regional contact:
    - **CA & West**: Jake Lenz
    - **US National & Other States**: Jana Ritter
    - **International**: Jana Ritter
  - CCs `info@rescuedogwines.com` and `blair.lott@rescuedogwines.com`.
  - Sends customer confirmation.

---

## 10. Donations

- 501(c) verification flow with strict required fields and document upload (`donation-documents` storage bucket, private).
- `send-donation-notification` Edge Function emails the org confirmation + admin notification.

---

## 11. Rescue Partner Content

- Public partners directory + spotlights.
- `RescuePartnerDialog` for inquiries.
- Editorial only — no monetary impact claims rendered.

---

## 12. CRM (`/crm`)

Sales operations dashboard. **Mandatory admin approval** before any new CRM signup is granted access.

Roles (stored in `user_roles` table — never on profiles):
- `owner`, `admin`
- `national_manager`, `regional_manager`, `state_manager`
- `brand_ambassador` (sales rep)
- `ambassador_manager` (rescue ambassador program)
- `wine_club_manager`, `dropship_manager`, `cms_editor`

Surfaces:
- Accounts (sales accounts, with map view + route planner)
- Approval queue (pending CRM signups)
- Referrals admin (manual approval of referral rewards)
- Margin analysis
- Compliance audit log
- Ambassador command center (`/crm/ambassadors`)
- Email System Test card (admin/owner only) — fires one of every transactional template through the email queue for QA
- Staleness tracking — flags accounts based on days since last order; cron job `stale-account-alerts` emails reps a daily/weekly digest

`has_role()` and `is_admin_or_owner()` SECURITY DEFINER functions back all RLS policies — no client-side role checks for sensitive data.

---

## 13. Rescue Ambassadors (Affiliate)

- Single-tier program; **impact.com** handles commission tracking, payouts, and 1099s.
- Vanity public profile pages (`/a/{handle}`).
- Tasting events: editor (admin) + public RSVP page.
- DB trigger `enforce_ambassador_impact_link` blocks activation without an impact.com tracking URL — prevents commission leakage.

---

## 14. Drop-Ship Partners

- `/dropship` portal for marketplace partners (apparel, accessories that RDW sells but partners fulfill).
- Tabs: Partners, SKUs, Curation, Marketplace, Orders, Payouts, Events.
- `dropship-partner-po` email template fires when a new PO is generated.

---

## 15. Store Locator

- Embedded Grappos iframe (third-party retailer locator).
- "Suggest a retailer" dialog feeds a Supabase table for future review.
- `compliant_retailer_set` SECURITY DEFINER function returns the nearest public retailers from internal `sales_accounts` (filtered to `is_public=true` and active/customer status) — used as a fallback when Grappos is unavailable.

---

## 16. CMS (`/cms`)

- Hybrid: Shopify Files for image storage, Supabase for structured content (blog posts, page sections, rescue spotlights).
- `cms_editor` role gates write access via RLS.
- Rich text editor + featured image upload → Shopify Files via Storefront mutations.

---

## 17. AI Sommelier & Pairings

- `/sommelier` chat powered by Lovable AI Gateway (Gemini 2.5 Flash for general; GPT-5 for complex pairing reasoning).
- `PairingFinder` + `PairingChips` for guided discovery.
- AI-generated wine club curation drafts (always reviewed by a human before publish).
- `merch-curator` AI scans Shopify catalog and proposes "Merch for wine lovers" curated sets.

---

## 18. Email Infrastructure

Single sender domain: **`notify.rescuedog.com`** (we are intentionally consolidating to this for long-term brand consistency).

- All emails (auth + transactional) flow through pgmq queues:
  - `auth_emails` (high priority)
  - `transactional_emails` (normal priority)
- `process-email-queue` Edge Function dispatches every 5s via pg_cron, handles retries, rate-limit backoff, TTL expiry, dead-letter routing.
- All sends logged to `email_send_log` (append-only). Suppression list (`suppressed_emails`) and one-click unsubscribe tokens (`email_unsubscribe_tokens`) maintained automatically.

Auth email templates (signup, magic link, recovery, invite, email change, reauthentication) — branded, in `_shared/email-templates/`.

Transactional templates (in `_shared/transactional-email-templates/`):
- ambassador-welcome
- donation-customer-confirmation, donation-admin-notification
- wholesale-customer-confirmation, wholesale-admin-notification
- stale-accounts-rep-alert, stale-accounts-summary
- dropship-partner-po
- reviewer-invite

---

## 19. Loyalty / "The Pack"

- Access-based, never percentage off.
- `loyalty_accounts` (balance + lifetime points) and `loyalty_ledger` (every event).
- Earn on order via `award-loyalty-points` Edge Function (idempotent on `(order_id, event_type, user_id)`).
- Redeem via `redeem_loyalty_points` RPC — enforces per-state blocklist and idempotency via `client_request_id`.
- Simulated earn (`simulate_loyalty_earn`) for testing — capped at $1000 subtotal.

---

## 20. Data Protection / RLS Posture

- Roles in dedicated `user_roles` table (never on `profiles`) — eliminates privilege-escalation class of bugs.
- All RLS policies use `has_role()` / `is_admin_or_owner()` / domain-specific SECURITY DEFINER helpers.
- `donation-documents` bucket private; `blog-media` public.
- Service-role key only used server-side in Edge Functions; never exposed to client.

---

## 21. Integrations Summary

| Integration | Use |
|---|---|
| Vinoshipper | Wine compliance, payment, fulfillment |
| Shopify (headless) | Merch catalog + checkout, CMS image storage |
| impact.com | Ambassador tracking, commissions, 1099 |
| Resend (via Lovable Email) | Transactional + auth email delivery |
| Grappos | Public retailer locator iframe |
| Mailchimp | Marketing list sync (separate from transactional) |
| GA4 + Meta CAPI | Web + server-side conversions |
| Stripe (sandbox only) | Donation payment rails (test mode during QA) |
| Lovable AI Gateway | Sommelier, curation, translation |

---

## 22. QA Phase — What Reviewers Should Know

We are about to publish to a Lovable preview URL for **review and QA only**. Important:

- **Not DNS-connected.** No traffic from `rescuedogwines.com` reaches this build.
- **Not customer-facing.** No marketing or organic discovery; URL is shared privately.
- **Vinoshipper** is in live-mode toggle but will be flipped to non-production checkout for QA where possible.
- **Stripe** is in **sandbox** for donations.
- **Email** sending is queued but won't actually deliver to customers during QA — only test addresses (e.g. `blair.lott@rescuedogwines.com`) will receive real mail. Production sender (`notify.rescuedog.com`) DNS verification is in progress.
- **Shopify** merch checkout opens the real Shopify-hosted checkout — reviewers should not complete a purchase unless explicitly asked to test that path.
- **CRM access** requires an admin to approve each new signup before any data is visible.

### Areas we want focused review on:
1. Compliance correctness (age gate, restricted state messaging, adult signature disclosure on every wine surface).
2. Tied-house separation between wine commerce and rescue partner content.
3. RLS policy coverage on `wine_club_*`, `loyalty_*`, `sales_accounts`, `donation_*` tables.
4. Email template accessibility (color contrast, plain-text fallback).
5. Cart dual-rail UX clarity (does a non-technical user understand wine and merch will check out separately?).
6. Wine Club customization cutoff logic and edge cases.
7. AI sommelier guardrails (no medical claims, no overpromising flavor matches, no underage references).
8. Ambassador activation flow — confirm impact.com link enforcement cannot be bypassed.

---

## 23. Known Open Items (pre-QA)

- DNS verification on `notify.rescuedog.com` in progress.
- Vinoshipper production webhook signing not yet rotated for the new sender domain.
- Loyalty earn-on-order is wired but awaiting first real Vinoshipper order to validate end-to-end.
- Mailchimp sync is one-way (Supabase → Mailchimp) — bi-directional unsubscribe sync is a follow-up.
- Mobile dashboard density on `/crm/route-planner` still needs a pass.

---

*End of brief.*
