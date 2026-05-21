---
name: 7-Rule Launch Compliance Guardrail
description: Hard content rules every blog draft, ad, and CMS-authored copy must pass before publish (inferred from brand memory, awaiting Blair sign-off).
type: constraint
---
# 7-Rule Launch Compliance Guardrail (DRAFT — awaiting Blair confirmation)

Every blog draft, ad creative, and CMS-authored block must pass all seven checks before flipping `is_public=true`. The seed/import edge functions run this server-side; a failure attaches `compliance_failures` to `content_index.raw` and forces draft state.

1. **No "free shipping" language.** Always "shipping included." Forbid: `/free shipping/i`.
2. **No quantified impact claims** unless they appear in the approved-fact allowlist. Forbid generic counters/totals: `/\d[\d,]*\s*(homes|dogs|meals|bottles|rescues)\s*(funded|saved|served|donated|placed)/i`. Allowed exception: the literal phrase "Partnered with 225 rescue organizations".
3. **No percent-off loyalty/rewards copy.** The Pack is access-based. Forbid: `/\b\d+%\s*(off|discount)\b/i` *inside* loyalty/rewards/referral contexts (Pack, member perk, refer-a-friend, rewards page). Order-level discounts (10% case, 20% club, 25% yearly) are fine when describing cart math, not loyalty.
4. **Mission framing intact.** Must not contradict "helping dogs find their forever home." Forbid: `/(donates?|gives?)\s+a\s+portion\s+of\s+every\s+bottle/i` (per brand directive).
5. **Age-appropriate wine context.** Drafts that mention wine purchase, tasting, or shipping must include or link an age-21+ cue. Soft check: warn if `/wine|bottle|tasting/i` present without `/21\+|adult signature|age verification/i` near a CTA.
6. **Vinoshipper handoff language correct.** Never imply we process wine payment. Forbid: `/(checkout|pay|buy)\s+(wine|bottle)s?\s+(on|at|with)\s+(our|rdw|rescue dog wines?)\b/i`. Use: "complete your wine order with our shipping partner Vinoshipper."
7. **Rewards/referrals OFF for launch.** No mention of referral codes, point balances, "refer a friend," or program signup CTAs in any new content. Forbid: `/(refer\s+a\s+friend|referral\s+code|earn\s+points|points?\s+balance|rewards?\s+program)/i`. (Re-enable post-launch when the dev toggle flips.)

## Approved facts allowlist
- "Partnered with 225 rescue organizations" (and tense variants).
- Wine club tiers: 20% on shipments, 25% on yearly case shipment.
- Guest case discount: 10% on full 12-bottle cases.

## Where the checker runs
- `supabase/functions/seed-seo-drafts/index.ts` — before insert; failing drafts still write but `is_public=false` and `raw.compliance_failures` lists violated rules.
- `supabase/functions/firecrawl-blog-import/index.ts` — imports are flagged in `raw.compliance_warnings` but kept public (legacy content).
- Manually re-run via the CMS "Compliance check" action (TODO post-launch).

## Status
DRAFT — needs Blair to confirm wording before treating as canonical. Once approved, lift the DRAFT tag and lock this memory file.