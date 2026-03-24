

# Rescue Dog Wines: Feature Gap Analysis and Enhancement Plan

## Current Site Analysis

### What rescuedogwines.com has (that this build is missing)

| Feature | Current WordPress Site | This Build |
|---------|----------------------|------------|
| Age verification gate | Yes (21+ modal) | Missing |
| Wine Club signup (Vinoshipper) | Yes, with 13 club tiers | Missing |
| Wine Club member pricing | Shown on every product | Missing |
| Award badges on products | Gold/Silver/Double Gold medals | Missing |
| Events calendar | Upcoming events section | Missing |
| Instagram feed | Live embedded feed | Missing |
| Store Locator | Dedicated page | Missing |
| Video hero background | Looping video | Missing (stock image) |
| About/Mission pages | Dedicated pages | Nav links go to "/" |
| Vineyard page | Lodi Rules sustainability info | Missing |
| Newsletter signup (footer) | Email capture with 10% off | UI exists, no backend |
| Quantity selector (1-72 bottles) | On product cards | Only on detail page |
| Promo code announcement bar | "STOCKUP" code banner | Exists |

### Competitor Feature Analysis

| Feature | Scout & Cellar | OneHope | Penfolds | Hand Selected |
|---------|---------------|---------|----------|---------------|
| **Sales Rep / Consultant model** | "Find a Consultant" + shop with rep | "Find My Wine Rep" + rep attribution | No | No |
| **Wine Club / Subscription** | Scout Circle (10% off subscriptions) | Wine Club with tiered perks ($500 gifts, tasting room) | Wine Club with exclusives | No |
| **Subscribe & Save** | Subscription on every product | Every product has 1/2/3 month frequency | No | No |
| **Shop by category** | Sparkling/Whites/Reds/Rose tabs | Tabs: Red/Sparkling/White/Rose/Minis/Bundles | By collection (Bin 707, Grange) | By brand |
| **State shipping check** | State selector in age gate | No | No | No |
| **Quick view / Quick add** | Quick view on hover | No | No | No |
| **Bundles / Mystery packs** | Spring Break Mystery Pack | Curated half cases, mystery packs | No | No |
| **Live chat** | Gorgias chat widget | No | No | No |
| **Events** | No | No | Mother's Day events, "Book Now" | No |
| **Testimonials** | Customer testimonials section | No | No | No |
| **"Join as Consultant"** | Yes, earn commissions | Rep matching/signup | No | No |
| **B2B / Wholesale** | No | No | No | "Where to buy" + Sign In |

---

## Recommended Implementation Plan

### Phase 1: Retain Existing Site Features (Priority)

1. **Age Verification Gate** -- Modal on first visit asking "Are you over 21?" with Yes/No buttons and "Remember me" checkbox. Uses localStorage to persist. Blocks site access if "No" is selected.

2. **Wine Club Section** -- Dedicated page or section with club tier options (matching the 13 Vinoshipper tiers). Include member pricing display on product cards (e.g., "$24.99 / $19.99 Wine Club Price"). Link to Vinoshipper for actual signup or build an embedded form.

3. **Award Badges on Products** -- Add award/medal metadata display on product cards and detail pages. Pull from Shopify product metafields or tags (e.g., "Gold - SF Chronicle").

4. **Events Page** -- New `/events` route showing upcoming events with date, time, description, and "More Info" links.

5. **About & Mission Pages** -- Dedicated `/about` and `/mission` routes with the sustainability story, Lodi Rules certification, vineyard info, and the "50% of profits" mission.

6. **Store Locator Page** -- New `/store-locator` route with an interactive map or list of retail locations.

7. **Instagram Feed Section** -- Embedded Instagram feed on the homepage (can use an Instagram embed or a simple grid pulling from their public feed).

### Phase 2: CRM Features for Sales Reps (New B2B Capabilities)

8. **Sales Rep Portal / Login** -- Authenticated area for sales reps to log in and manage their accounts, leads, and orders. Requires Supabase backend with roles (sales_rep, admin).

9. **"Shop with a Rep" Flow** (inspired by Scout & Cellar and OneHope) -- Customers can search for or be assigned a sales rep. Rep ID is stored in the session/URL so orders are attributed to the rep. Rep gets commission tracking.

10. **Rep Dashboard** -- Sales reps see: their assigned accounts, order history, pipeline/leads, commission summary, and can place orders on behalf of customers.

11. **Lead Capture & CRM** -- Wholesale inquiry form submissions are stored in Supabase and visible in the rep dashboard. Reps can update lead status (New, Contacted, Qualified, Won, Lost).

12. **Customer Account Pages** -- Logged-in customers can view order history, manage Wine Club subscription, and see their assigned rep.

### Phase 3: Competitive Feature Additions

13. **Subscribe & Save on Products** -- Add subscription frequency selector (1/2/3 months) on product cards, similar to OneHope. Integrate with Shopify selling plans or a custom subscription model.

14. **Shop by Category Tabs** -- Add filterable tabs on wines page: Red, White, Sparkling, Rose, Bundles. Use Shopify product tags or types for filtering.

15. **Wine Bundles / Mystery Packs** -- Create curated bundle products in Shopify. Feature them prominently on homepage and shop pages.

16. **Quick View on Product Cards** -- Hover/click to see product details in a modal without navigating away.

17. **Shipping State Checker** -- In the age gate or cart, let customers select their state to verify shipping availability before checkout.

18. **Live Chat Widget** -- Integrate a simple chat solution (e.g., Crisp, Tawk.to, or custom) for customer support.

19. **Testimonials Section** -- Homepage section with customer quotes (manually managed, not fake reviews).

---

## Technical Approach

- **Frontend**: All UI built in React/Tailwind maintaining the current brand aesthetic (Cabin font, red/black/white, sharp edges)
- **Backend**: Supabase (via Lovable Cloud) for CRM features -- user auth, roles table (sales_rep, admin, customer), leads table, rep-customer assignments
- **Shopify**: Continue using Storefront API for products/cart/checkout. Product metadata (awards, club pricing) via metafields or tags
- **State management**: Extend Zustand stores for rep attribution and user session

## Suggested Implementation Order

Start with Phase 1 (features your current site already has) to reach feature parity, then Phase 2 for the CRM/sales rep capabilities, then Phase 3 for competitive enhancements. Each step can be broken into individual prompts.

