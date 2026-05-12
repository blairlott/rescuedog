ns# Merch Boutique Relaunch — Build Plan

Goal: lift /merch to boutique-grade UX (Aimé Leon Dore / Wild One / Buck Mason quality of restraint), drive incremental AOV, and reinforce the Rescue Dog wine brand. Palette stays red/black/grey; we're elevating composition, photography, typographic restraint, and the cross-sell mechanics — not changing brand colors.

---

## Sprint 1 — Revenue movers (ship first)

1. **Bundle builder + curated kits**
   - New table `merch_bundles` (handle, title, sku_handles[], bundle_price_cents, hero_image)
   - Seed three kits: "Adoption Day Kit", "Wine Night Kit", "New Pup Welcome Kit"
   - `BundleCard` component on /merch above the grid; one-click "Add bundle to cart" pushes all SKUs as discrete line items with a `bundleId` tag for cart grouping

2. **"Pair It" PDP cross-sell**
   - New `PairingPicker` block on every merch PDP — pulls 1 wine recommendation (rule: tag-based; e.g. apparel→Cab, glassware→Chardonnay)
   - "Add the [merch] + a bottle of [wine] — save $X" combined-add button

3. **Gift mode in cart**
   - Toggle in CartDrawer: gift wrap ($4), gift message (textarea, 250 chars), recipient email
   - Persisted on cart line via Zustand; surfaced at checkout email (mailto) and Vinoshipper handoff (note field)

4. **Sticky mobile add-to-cart on PDP**
   - Bottom-fixed bar on `<md` showing variant selector + price + Add — best-practice CVR lift

5. **Split-checkout cart**
   - CartDrawer groups items into **Wine** and **Merch** sections with separate totals
   - Two CTAs: "Checkout wines via Vinoshipper" + "Checkout merch" (clearly labeled, no confusing single button)
   - Single combined "shipping included" progress bar removed; each group shows its own threshold

---

## Sprint 2 — Editorial polish

6. **Hero refresh**
   - Replace current hero with full-bleed editorial composition: large dog/lifestyle image, restrained serif-style display headline, single accent CTA
   - Add a quiet rotating tagline ("Wear the cause." / "Spoil the pup." / "Toast the rescue.") with 4s crossfade

7. **PLP editorial breaks**
   - Every 8 product cards, inject a full-bleed lifestyle row: photo + 1-line caption + small "Read the story" link
   - 3 stories rotated: founder story, partner shelter spotlight, ambassador feature

8. **"The Edit" capsules on /merch home**
   - Three curated capsules above the grid: "For the Rescue Parent", "For the Wine Lover", "For the New Pup"
   - Each capsule = 1 hero image + 4 SKU thumbnails + capsule blurb

9. **Typographic restraint pass**
   - Audit all-caps usage on /merch — keep on chips/CTAs only, demote section headlines to mixed-case display
   - Tighten letter-spacing on small caps; loosen leading on body
   - Generous breathing room: bump section vertical padding to 120–160px on desktop

10. **Product card refinement**
    - Larger imagery (4:5 not 3:4), price below title not centered, hover reveals secondary lifestyle image
    - Award/sale badge moves to small wordmark-style label (no chip backgrounds)

---

## Sprint 3 — Wine ↔ merch cross-pollination

11. **Rescue impact line on every PDP**
    - "This purchase = ~4 meals at our partner shelter" computed from price tier
    - Lives under the price, never as an interruption

12. **Wine-club crossover badge**
    - On merch PDP for logged-in club members: "🍷 Ships free with your next club box" if cart total qualifies

13. **Unified visual system across /wines, /merch, /club**
    - Shared `<EditorialHero>`, `<EditorialBreak>`, `<CapsuleCard>` components in `src/components/editorial/`
    - Apply to /wines and /club homepages so the brand feels one (not two storefronts stitched together)

14. **Footer cross-link strip**
    - Always-visible "Explore Wines / Explore Merch / Join the Club" trio at the top of the footer

---

## Sprint 4 (light) — Polish & QA

15. **PDP enhancements**: size guide modal for apparel; recently-viewed strip; review proof block (mocked stars + count from existing fields)
16. **Loading / empty states**: skeleton cards on PLP filter change; warmer empty-cart copy
17. **Analytics events**: add cart events for bundle adds, gift toggles, pair-it adds (groundwork for later attribution)
18. **Cross-browser/mobile QA pass** at 375 / 768 / 1280 / 1920

---

## Technical notes (non-user-facing)

- New tables: `merch_bundles` (RLS: public read active, admin write)
- New components: `editorial/EditorialHero`, `editorial/EditorialBreak`, `editorial/CapsuleCard`, `merch/BundleCard`, `merch/PairingPicker`, `merch/StickyAddBar`, `cart/CartGroup`, `cart/GiftMode`
- Cart store extension: `bundleId`, `giftMode: { wrap, message, recipient }` on CartItem
- Pairing rules live in `src/lib/pairings.ts` (extend the existing pairings system)
- Routing unchanged
- All new copy and images stay editable via existing CMS panels

---

## Rollout order

1. Sprint 1 in one push (revenue mechanics — measurable lift)
2. Sprint 2 once Sprint 1 is in production for ≥1 week (visual polish)
3. Sprint 3 + 4 together as the "brand unification" release

I'll start on Sprint 1 immediately upon approval.
