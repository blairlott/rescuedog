---
name: Mailchimp Integration for Retailer Signal Emails
description: How locator/CRM signal engine talks to Mailchimp for compliant where-to-buy campaigns
type: feature
---
RDW uses Mailchimp for marketing email. The locator/CRM signal engine is the brain (deciding who/when/what); Mailchimp is the delivery arm.

## Two integration modes
1. **Audience sync (Phase 1-2 default)**: Edge function pushes signal-matched users into a tagged Mailchimp segment (e.g. `signal_atlanta_surge_2026_05`). Human triggers campaign in Mailchimp UI using approved compliant templates.
2. **Transactional / Mandrill API (Phase 4 upgrade)**: Signal fires → API send, no human in loop. Use only after compliance template library is locked.

## Hard requirement
ALL retailer-naming sends — both modes — must call `getCompliantRetailerSet()` and inject 3+ retailers per tied-house rules. See `mem://features/tied-house-compliance`. No exceptions.

## Architecture
- Provider-agnostic `notify` interface in code so we can swap Mailchimp → Klaviyo → Lovable Email later without rewriting signal logic
- Mailchimp API key as Lovable Cloud secret (when ready to build)
- Sync runs nightly batched, not per-event (avoid API rate limits)
