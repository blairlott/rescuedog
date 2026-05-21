# Pre-Launch Execution Plan (Sections 2–8)

Section 1 (DNS) is explicitly post-launch and gated on Blair — excluded from this plan. I'll break the remaining work into discrete, reviewable passes so you can sign off section-by-section rather than receive one giant unreviewable diff.

## Pass A — Section 2: CMS Dev Toggles (BUILD)

New table `dev_toggles` (single-row JSON config or key/value rows) stored in Supabase, exposed via CMS admin under **Settings → Dev Controls**.

**Toggle Group 1 — Account Features** (master + 6 sub, all default OFF; Subscribe & Save locked ON, not rendered as editable)
- Login/Register, Order History, Wine Club Portal, Loyalty/The Pack, Saved Addresses, Referral Program

**Toggle Group 2 — Customer Notifications** (master + 7 sub, all default OFF; S&S confirmation locked ON)
- Order confirmation, Shipping updates, Wine club billing, Abandoned cart, Win-back, Post-purchase, Welcome series

Enforcement:
- Frontend `useDevToggles()` hook gates route mounts + nav links for account features.
- Edge functions check toggle state before any Mailchimp/Resend dispatch (helper `isNotificationEnabled(category)` in `_shared/`). S&S confirmation bypasses the check.
- Admin-only RLS on `dev_toggles` write; public read of effective state.

Deliverables: migration + admin page + hook + shared edge helper + wiring into existing welcome/winback/cart edge functions.

## Pass B — Section 3: Compliance Audit (REPORT + FIX)

Crawl every route and component against the 7 compliance rules (age gate, shipping disclosure, "shipping included" language, no quantified impact, access-based loyalty wording, dual-brand logo discipline, brand lock fonts/colors/sharp edges). Output a violations report; fix anything that's a copy/styling change in the same pass. Flag anything structural for explicit approval.

## Pass C — Section 4: Conversion Flow Verification (TEST + REPORT)

Walk each path in the live preview:
1. Wine PDP → ATC → Cart → Vinoshipper handoff (UTM + gclid preservation verified by inspecting redirect chain).
2. Merch PDP → ATC → Shopify checkout.
3. Subscribe & Save → confirmation email fires.
4. Sticky ATC + mobile cart close X visibility check on every wine PDP.

Output: pass/fail matrix + screenshots of any broken steps + fixes for in-scope issues.

## Pass D — Section 5: Tracking & Analytics Verification (TEST + REPORT)

Network/console inspection of: Meta Pixel + CAPI event_id format `rdw_{txn}_{event}_{ts}`, GTM-5DBQXWP7 load, GCLID capture tag, Purchase (VS webhook), ViewContent, InitiateCheckout, GA4 pageview. Anything missing gets fixed.

## Pass E — Section 6: DB & Performance Audit (REPORT + FIX)

1. **DB:** enumerate tables, find unused columns / missing indexes. Add the 5 indexes Lindy named (`vs_transactions.customer_email`, `vs_transactions.state`, `vs_transactions.created_at`, `capi_event_log.event_id`, `gclid_session_log.hashed_email`) if not present.
2. **Cron:** list `cron.job`, flag duplicates/stale.
3. **Edge fns:** scan for N+1 patterns and redundant API calls in `vinoshipper-poll`, `kennel-ingest`, `capi-weighted-events`, `boost-dispatch`. Add in-memory cache for `state_margin_tiers`.
4. **Frontend:** Lighthouse on home / wine PDP / merch PDP / /shop-wine / cart at 390×844. Lazy-load below-fold images, preload hero, strip render-blocking scripts, WebP check.

Deliverable: before/after table per the directive's "Report back" requirement.

## Pass F — Section 7: A/B Test Readiness (VERIFY + DOCUMENT)

Confirm Cloudways WP split script doesn't collide with GTM-5DBQXWP7. Verify GA4 stream/UTM separation between legacy and Lovable. Write rollback runbook to `docs/abtest/rollback.md`. Define metric definitions (CVR primary, AOV, bounce, cart abandon, LCP).

## Pass G — Section 8: QA Sign-off Package

Compile a single QA report doc summarizing pass/fail for Sections 2–7 with links to evidence, ready to paste into the Google Doc for Blair / Claude / RDW staff sign-off. No DNS or traffic-split actions taken.

---

## Execution rules

- One pass per turn. After each pass I'll surface findings + diff summary and wait for your "go" before starting the next pass.
- Anything that needs a credential I don't have (e.g. Lighthouse against the published URL, Meta Events Manager confirmation) I'll call out explicitly rather than fake-pass it.
- Memory updates: add a `dev-toggles` memory after Pass A so future sessions respect the locked-ON exceptions.

## Technical notes

- `dev_toggles` schema: `category text`, `key text`, `enabled bool`, `locked bool`, PK `(category, key)`. Locked rows reject UPDATE via RLS check.
- Notification gate helper lives in `supabase/functions/_shared/devToggles.ts` and is imported by every send-path edge function.
- Index additions go through a migration; data audits use `supabase--read_query` only.
- Lighthouse runs via the browser performance profile tool against the preview URL.

Confirm and I'll start Pass A (Section 2 — CMS Dev Toggles).