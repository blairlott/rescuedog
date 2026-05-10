---
name: Legacy UX Patterns to Inherit
description: User experience features from rescuedogwines.com worth porting to the new build
type: feature
---
Audited 2026-05-10 from rescuedogwines.com home, /shop, /club, product cards.

## Inherit (high value)
1. Age gate modal with "Remember me" checkbox (already in place; legacy uses 21+ wording verbatim).
2. Product card pattern:
   - Vintage + varietal as H2 (e.g. "2024 Chardonnay")
   - Retail price prominently, "$X.XX Wine Club Member Price" beneath in smaller type
   - Award badge row (e.g. "Gold - SF Chronicle Wine Competition") with trophy icon
   - 3-word tasting descriptors in caps (e.g. "BALANCED. FRUITY. LUSCIOUS.")
   - Quantity selector with bottle counts 1-12, 24, 36, 48, 60, 72
   - "Learn More" link + "Add to Cart" CTA
3. Shop page header band: "ORDER AWARD-WINNING WINES" eyebrow -> "Online Wine Shop" H1 -> "50% of OUR PROFITS SUPPORT DOGS!" subhead with "-> LEARN HOW WE GIVE." link to /about.
4. Inline shipping/compliance copy block above product grid (flat $9.99 with 6+, signature required, UPS Access Point, failed-delivery policy, weather delays).
5. Wine type filter pills above grid: White / Rose / Red / Sparkling / All Wines.
6. Featured bundle card style (Mother's Day 6 Pack) with "Shipping Included!" pill and "Special price not stackable with any other discount" disclaimer.
7. Email capture in footer: "Receive a code for 10% off your next order!" with reCAPTCHA.
8. Events module on homepage grouped by month with date/time and "More Info" link.
9. Instagram feed grid in footer area (pull from @rescuedogwines).
10. Lodi Rules Certified Green badge near vineyard CTA.
11. Wine Club signup wizard: Club Selection -> Delivery (with gift toggle) -> Payment -> Personal Info (Title, First, Last, Phone w/ SMS consent, Email, DOB month/day/year, 21+ check). Already captured in mem://features/wine-club-system.
12. Bundle / SKU naming convention: vintage-prefixed (e.g. "2023 Cabernet Sauvignon", "NV Methode Champenoise Demi-Sec Sparkling Wine").

## Skip / replace
- "Unable to load Stripe" club checkout (legacy bug). New build uses Vinoshipper hosted flow.
- WordPress Instagram feed plugin's admin error UI - replace with clean Instagram embed.
- Vinoshipper external login link "vinoshipper.com/login/?pid=2212" - replace with our own /club/login that brokers Vinoshipper customer ID.
- Free-text "Vinoshipper" branding shown on club page - hide from end users.
