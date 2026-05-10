---
name: Tied-House Compliance for Retailer Communications
description: Federal/state alcohol tied-house rules requiring 3+ unaffiliated retailers in any where-to-buy messaging
type: constraint
---
**HARD COMPLIANCE RULE** — Federal TTB tied-house regs and state ABC laws prohibit a producer from promoting a specific retailer in a way that gives "a thing of value."

## Required in EVERY consumer-facing communication that names retailers
- **At least 3 unaffiliated retailers** listed
- **Equal prominence** — identical styling, no hero/featured slot, no preferential ordering beyond neutral criteria (alphabetical or distance)
- **No exclusivity language** — never "only at...", "exclusively at...", "find it at [Store]"
- **Producer-funded only** — no retailer co-branding or co-pay
- **Standard producer disclosure footer** on all sends
- **Log retailer IDs** in `email_send_log` for audit trail

## Applies to
- All "where to buy" emails (surge signals, new placement, locator share)
- Wine club "local store has it" nudges
- Public locator share-via-email
- All Phase 4 ad creative naming retailers (Meta, Google, OOH)
- Any organic social naming retailers

## Implementation pattern
Single helper `getCompliantRetailerSet(zip, count=3)`:
- Pulls 3+ active retailers in radius from `sales_accounts`
- If <3 in primary radius, expand radius until 3 found
- If still <3, fall back to generic "find a retailer near you → /where-to-buy" (no specific stores)
- Block send if function returns <3 and no fallback specified

## State overrides
Some states stricter than federal: NY, MA, TX especially. Geo-gate templates by recipient state when needed. GA = federal baseline.

## Why
Violation = TTB fine + state ABC license risk. Non-negotiable.
