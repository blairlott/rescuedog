## Full-site UX audit — prioritized fixes for purchase experience

Based on a walk-through of Header, Home, Wines, PDP, Cart, and the Vinoshipper hand-off. Grouped by impact tier so you can approve all, or just P0/P1.

---

### P0 — Friction in the path to purchase (ship first)

1. **Header search is non-functional**
   The 🔍 icon in the desktop header has no handler. Either wire a real product search (against wine_products + WP) or hide the icon until ready. Missing search = lost intent on a 10-SKU catalog where users still type "rosé" / "sparkling".

2. **Mobile nav is a flat list of 9 items**
   No grouping, no visual hierarchy, no Account/Cart in the mobile sheet. Restructure: SHOP (Wines, Merch, Bundles) · CLUB · FIND US (Locator, Events, Ambassadors) · ABOUT (Mission, About, Donation) · ACCOUNT.

3. **Cart drawer is overloaded on mobile (375px viewport)**
   At 375×550 the drawer stacks: ribbon + member badge + shipping bar + items + upsell + recommendations + trust + gift + save + case-topup + club upsell + nudge + total + CTA. Users can't reach Checkout without 4+ scrolls. Fix:
   - Collapse Trust / Gift / Save-for-later into a single "More options" accordion
   - Pin Total + Checkout button to the bottom always (sticky footer inside SheetContent)
   - Move Recommendations BELOW the fold or only render when cart ≤ 2 items

4. **Checkout hand-off is a modal, not a redirect**
   `VinoshipperCheckoutModal` keeps users on our domain wrapping a VS iframe. This breaks browser back-button, autofill, Apple/Google Pay sheets, and password-manager card vault. Switch to a real redirect to VS hosted checkout (or a top-level new tab) — recover the iframe friction.

5. **PDP "Add to Cart" CTA value is buried**
   Mobile sticky bar shows price only. Add: bottle count, per-bottle savings if member, and "Ships to {state}" status inline. Today the ShipsToStateCheck sits mid-page and is easy to scroll past before tapping Add.

---

### P1 — Conversion lifters (next sprint)

6. **No persistent cart recovery / abandoned-cart capture**
   `CartSaveForLater` exists but is opt-in. Add: auto-capture email at first add-to-cart (soft prompt, dismissible) → triggers Mailchimp abandonment series after 1h / 24h. Today there is zero recovery if the user closes the tab.

7. **No express-pay buttons**
   VS supports Apple/Google Pay at hosted checkout but the user has to load the iframe first. Add Apple Pay / Google Pay buttons in the cart drawer that deep-link to VS with the cart pre-loaded — saves 2 screens for ~30% of mobile traffic.

8. **PDP lacks social proof**
   No reviews, no "12 people bought this week", no awards visible above the fold. Awards exist as tags but only render as a badge on the card, not on PDP. Surface them next to the price.

9. **Shop / Wines page has no sort or filter beyond category tabs**
   Add: Sort by (Best seller / Price low→high / New) and a "Members only" toggle. With 10 SKUs this is light, but the toggle becomes essential once club-exclusives grow.

10. **Free-shipping threshold messaging is inconsistent**
    Header banner says "20% off 12+ bottles (shipping included)", FreeShippingBar tracks 6 bottles, CartUpsellBanner says something else. Audit all four places and use one source of truth from `cart_settings`.

11. **No order confirmation experience on our domain**
    After VS checkout the user is on vinoshipper.com. We never thank them, never trigger Meta CAPI / GA4 purchase event, never offer post-purchase upsell (club join, ambassador signup, referral). Add a `/thank-you?vs_order=…` route the VS webhook redirects to.

---

### P2 — Polish + retention

12. **PDP image zoom missing** — tap-to-zoom or hover-zoom on bottle shots.
13. **Quantity stepper on PDP allows unlimited** — cap at available inventory, show "Only N left" when ≤6.
14. **Favorites (heart icon) has no /account view** — verify and link from header.
15. **Sommelier chat is hidden** — add a floating launcher on wine routes; today it only appears via Pairing chips.
16. **Account page** — verify last-order, reorder, subscription pause, and address book all exist; gap-fill what's missing.
17. **Empty-state on /wines after filter** says "No wines found" — add a "Clear filter" CTA.
18. **Age gate** — confirm it remembers the user across sessions for 30 days; today it may re-prompt.
19. **Performance** — Index page loads YouTube iframe + 6 Instagram CDN images + 50-product query on first paint. Lazy-load below-the-fold and defer the YT iframe until in-view.

---

### Backend / data

20. **Cart state is localStorage only** — no cross-device cart for logged-in customers. Add a `customer_carts` table keyed by `user_id`, sync on login.
21. **Donation impact line is hard-coded** ($1/bottle, 1 dog/4 bottles). Move to `cart_settings.donation` JSON so CMS can tune without code (you flagged this earlier — still open).
22. **Vinoshipper webhook → impact_events** — confirm every completed VS order writes to `impact_events` so the homepage counter is real, not heuristic.
23. **Mailchimp triggers** — abandonment, post-purchase, club anniversary, win-back at 90 days. Today only newsletter signup is wired.
24. **Tied-house compliance check** on any retailer-mention email → block send if <3 retailers (already a memory; verify enforced at edge function level, not just UI).

---

### Suggested execution order

- **Sprint 1 (P0):** items 1, 3, 4, 5 — direct conversion blockers on mobile.
- **Sprint 2 (P1):** items 6, 7, 10, 11 — abandonment recovery + thank-you page + threshold cleanup.
- **Sprint 3 (P1+P2):** items 8, 9, 12–19 — polish round.
- **Sprint 4 (Backend):** items 20–24 — durability + data correctness.

Approve the whole plan, or tell me which tier(s) to start with and I'll create tasks and ship sprint 1.
