
# Domain Migration + Kennel Fix Plan

## Phase 1 — Fix Kennel on published site (do first)

The Kennel works on the preview URL but not on `rescuedog.lovable.app/kennel`. Most likely cause: the published build is missing the Kennel routes or the CmsAuth session cookie isn't being set on the `.lovable.app` host. Steps:

1. Open `rescuedog.lovable.app/kennel` and capture the exact symptom (blank, redirect, 404, or auth screen) plus console + network logs.
2. Inspect `src/App.tsx` routing — confirm `/kennel/*` routes are not behind a `import.meta.env.DEV`, `window.location.hostname === 'localhost'`, or preview-only guard.
3. Check `KennelGuard` and `useCmsAuth` for any hostname checks that would block production.
4. Republish and re-verify.

## Phase 2 — Attach rescuedog.com → /merch (root rewrite)

Goal: visitors typing `rescuedog.com` land on the merch storefront with `rescuedog.com` staying in the address bar (no visible `/merch` path).

1. **In Lovable → Settings → Domains**: attach `rescuedog.com` (and `www.rescuedog.com`) as a custom domain to this project. Lovable will provide the A / CNAME records.
2. **At the registrar / Cloudflare**: replace the current WordPress DNS records with Lovable's records. TTL low (5 min) during cutover.
3. **In the app**: add a host-aware root redirect/rewrite so when `window.location.hostname` is `rescuedog.com` or `www.rescuedog.com` and path is `/`, render the Merch home (either internal redirect to `/merch` or mount `MerchHome` at `/` for that host).
4. **Branding guard**: confirm the dual-brand logic (mem://features/branding) treats `rescuedog.com` as the merch brand (high-def Rescue Dog logo), not the wine brand.
5. **Age gate**: confirm `/merch` and merch-host root remain age-gate-bypassed.
6. **SEO**: update canonical + sitemap for merch pages to use `https://rescuedog.com/...`.

## Phase 3 — Migrate rescuedogwines.com → root of Lovable app

Done only after Phase 2 is stable in production.

1. Attach `rescuedogwines.com` + `www.rescuedogwines.com` as a second custom domain on the same Lovable project.
2. Cut DNS over from WordPress to Lovable.
3. Host-aware routing: `rescuedogwines.com/` → wine homepage (current `/` route); age gate enforced.
4. Preserve high-value WordPress URLs with 301s (e.g. `/shop`, `/wines/<slug>`, `/about`) — list the top 10–20 from analytics, map each to the Lovable equivalent, add to a redirects table in the host router.
5. Update `robots.txt` + `sitemap.xml` to emit two sitemaps (one per host) or a host-aware sitemap.
6. Decommission WordPress only after 48h of clean traffic on the new host.

## Technical Details

- **Custom domain attachment is a Lovable dashboard action** — I can't do it from code. You'll need to add the domain in Settings → Domains, then paste the DNS records into your registrar.
- **Host-aware routing** lives in a small `useHostBrand()` hook (already partially exists per mem://features/branding). Extend it to also drive the root route component, not just the logo.
- **No backend changes**: Shopify Storefront API, Vinoshipper deep-links, and Supabase Cloud all work identically regardless of which custom domain serves the SPA.
- **Rollback**: keep WordPress live but un-pointed for 7 days after each cutover so DNS can be reverted instantly if needed.

## Open items I'll need from you during build

- Kennel symptom on the published URL (so Phase 1 doesn't guess).
- The list of high-traffic WordPress URLs to 301 (from your analytics) before Phase 3.
