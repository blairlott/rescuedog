# Make rescuedogwines.com Crawlable (Vite + React, no framework migration)

Sequenced exactly per your brief. I'll **stop and report after each step** for your go-ahead before moving on. No Next.js, no visual changes.

---

## Step 1 — Prerendering (highest priority)

**Approach:** Add `vite-plugin-prerender` (uses Puppeteer, integrates with existing Vite build, no source restructuring). `react-snap` is the alternative but it's unmaintained since 2020 — `vite-plugin-prerender` is the right call.

**Routes to prerender:**
- `/`
- `/shop` (current path is `/wines` — will confirm and prerender the canonical one)
- `/club` (Wine Club)
- `/mission` (cause / rescue partners page)
- `/wine-that-gives-back`
- `/ambassadors`
- `/press`
- `/policies`
- Every individual wine PDP — pulled at build time from the `wine_products` table via the Supabase anon key (already in `.env`)

**Excluded from prerender** (correctly noindex'd already): `/crm/*`, `/cms/*`, `/kennel/*`, `/admin/*`, `/finance/*`, all `*-login`, `/account`, `/checkout`, `/thank-you`, `/unsubscribe`.

**Age-gate consideration:** Puppeteer will hit the age modal during prerender. I'll set `localStorage.rdw-age-verified=true` in the prerender script's page context so the real HTML renders. Step 6 then makes sure the gate doesn't hide HTML from crawlers either way.

**Verification:** `curl https://rescuedogwines.com/wines/<slug>` → must show `<h1>`, product name, price, description in the response body.

---

## Step 2 — Per-route meta tags

`react-helmet-async` is **already installed** (used by the `<Seo>` component we audited last week). I'll audit which prerendered routes are missing it and fill the gaps. Per-PDP `og:image` = bottle shot, not the site default. Canonical on every page.

---

## Step 3 — `/og-default.jpg`

Check `public/og-default.jpg` exists at 1200×630. If missing or low-res, generate a brand-correct one (red #c30017 + black RDW logo, no "free shipping" copy).

---

## Step 4 — JSON-LD structured data

Already have `src/lib/jsonLd.tsx`. Will extend so the prerender output includes:
- `Organization` on `/` with `sameAs` (need IG/FB/LinkedIn URLs from you — see Open Questions)
- `Product` on each PDP — name, image, description, brand "Rescue Dog Wines", offers (price, availability), `aggregateRating` only when reviews exist
- `WebSite` + `SearchAction` on `/` pointing at `/wines?q={search_term_string}`

---

## Step 5 — sitemap.xml + robots.txt

Both already exist in `/public`. I'll regenerate sitemap from live DB at build time (`scripts/generate-sitemap.ts` predev/prebuild hook) with all canonical URLs + `lastmod`. Confirm robots.txt allows all + references sitemap.

---

## Step 6 — Age-gate audit

Current `AgeGate.tsx` is client-side localStorage — good. Need to verify it never returns `null` from `<App>` before children mount (which would empty the DOM for crawlers). Refactor if needed so the gate is a pure **overlay** while the underlying `<main>` HTML is always present in the source.

---

## Step 7 — GTM dataLayer sanity

GTM-NHTH66HM head snippet + `<noscript>` iframe placement check in `index.html`. Add a route-change listener that pushes:

```js
dataLayer.push({
  event: 'page_view',
  page_type: 'home' | 'shop' | 'pdp' | 'club' | 'mission' | ...,
  wine_sku: <sku or undefined>,
  user_status: 'member' | 'non_member' | 'unknown',
});
```

Wire `user_status` to `useCustomerAuth` + `useIsMember`.

---

## Step 8 — Lighthouse baseline

Run Lighthouse mobile on `/` and one PDP **before** changes and **after**. Report deltas. Targets: LCP < 2.5s, CLS < 0.1, Perf ≥ 85. Prerendering alone usually nets +15–25 perf points because the LCP image and H1 are in the static HTML.

---

## Open questions (need before Step 4)

1. **Social `sameAs` URLs** — please paste Instagram, Facebook, LinkedIn handles/URLs for the Organization schema.
2. **Shop path canonical** — site currently uses `/wines`, your brief says `/shop`. Should I (a) keep `/wines` as canonical, (b) add `/shop` as a 301-style alias that renders the same page, or (c) rename `/wines` → `/shop`? Recommend (a) — `/wines` is already indexed and on the sitemap.

---

## Execution cadence

I'll do **Step 1 only**, report what changed + a `curl` verification of one prerendered route, and wait for your green light before Step 2. Same pattern through Step 8.

Ready to start Step 1 on your go.
