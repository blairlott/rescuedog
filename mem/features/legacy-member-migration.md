---
name: Legacy Member Migration
description: Grandfather existing Vinoshipper club members; port them to the new system in phases without forced re-signup.
type: feature
---
Existing wine club members (currently managed directly in Vinoshipper) must be **grandfathered** — never forced to re-sign up or change billing/shipping.

**Phased migration:**
1. **Phase 1 (launch):** Legacy members untouched. New signups use the new configurator → Vinoshipper API flow.
2. **Phase 2 (~30–60 days after launch):** Background sync links each Vinoshipper customer/membership to a `wine_club_memberships` row via `vinoshipper_customer_id`. Legacy members get access to the new member dashboard. Existing tier/pricing/payment unchanged.
3. **Phase 3:** Single unified system. All members managed through new dashboard. Vinoshipper remains the order/billing/compliance backbone.

**Rules:**
- Never force a legacy member to re-enter payment or shipping info — Vinoshipper already has it.
- Grandfather their current discount rate; only offer (don't force) tier changes.
- Vinoshipper is the source of truth for membership state; our Supabase is a UX/dashboard layer synced via webhooks.
