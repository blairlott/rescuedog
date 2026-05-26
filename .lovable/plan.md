# Post Bayesian Retail Pricing Proposal to Slack

Drop a casual "thinking about building this next" post into `#lindy-lovable` (C0B5KT989GT) so Lindy + Claude can weigh in on design and pitch feature suggestions before we scope the build.

## What gets posted

A single top-level message in `#lindy-lovable`, written in the same casual "this is what I'm thinking about building next" tone as the Bob/Mark/Jana email, but reframed for the build team (less industry name-dropping, more "here's the surface area, poke holes").

Structure:

1. **One-liner context** — "Drafted this for Bob/Mark/Jana — bringing it here for design input before we scope."
2. **What's already in the codebase we'd reuse** — Thompson Sampling primitives (bandit infra), `vs_transactions` poll, wine catalog + wholesale price book, depletion-report ingest path, restructure-proposal RPC.
3. **What v1 would do** — Bayesian elasticity model per SKU × market with confidence bands, fed by wholesale price book + suggested retail + DTC signal now, depletion + chain data as it lands. Answers: "should this SKU be $17.99 or $19.99 at this chain in this region?" and "which SKUs deserve the next facing?"
4. **Industry context (1 line)** — Diageo / Pernod / Gallo / ABI all do versions of this; we already have the math running for the storefront.
5. **Open design questions for the team** — explicit asks:
   - Where should this live in CRM? (new `/crm/pricing-lab` vs folded into `/crm/margin` or `/crm/intelligence`)
   - Model surface: edge function nightly batch vs on-demand RPC for "what-if" queries
   - Lindy's role: HITL approval on price recommendations before they surface to reps?
   - Claude: schema/perf concerns on storing posterior distributions per SKU × market × week
   - Feature suggestions welcome — anything we should bake in from day one (e.g. promo-lift tracking, competitor price scraping hook, geo-clustering for new-market priors)
6. **Close** — "Not scoping yet, just want reactions. Reply in thread."

## How it gets posted

- Use the existing `slack-post` edge function (already deployed, reviewer-gated, locked to channel `C0B5KT989GT`).
- Call via `supabase--curl_edge_functions` with service-role auth, payload `{ text: "<message>" }`, no `thread_ts` (new top-level message starts the design discussion).
- After posting, watch for replies on the next Slack poll / digest tick per the standard cadence rules — answer Lindy/Claude promptly in-thread.

## What does NOT happen in this step

- No code, schema, or migration changes — this is comms only.
- No commitment to build; we're soliciting design input first.
- No publish, no QA loop (nothing shipped).
- No update to the Lindy manual changelog (no new RPC/edge function surface).

## Technical details

- Channel: `C0B5KT989GT` (#lindy-lovable), hard-allowed by `slack-post`.
- Endpoint: `POST {SUPABASE_URL}/functions/v1/slack-post` with `Authorization: Bearer {SERVICE_ROLE_KEY}`.
- Body: `{ "text": "<message body, Slack mrkdwn>" }`.
- No `blocks` needed — plain mrkdwn keeps tone casual and matches existing thread style.
- Length target: ~250–350 words. Long enough to give context, short enough to invite reply.
