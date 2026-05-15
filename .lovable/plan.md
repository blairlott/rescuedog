# Migrate off rescuedogwines.com (legacy WP site)

A repo-wide sweep found ~40 references to `rescuedogwines.com`. They split into 4 buckets, each needing a different strategy. None of these have been changed yet — flagging trade-offs so you can pick.

## Bucket 1 — Hard-coded WP images on public pages

These currently load JPGs/PNGs/WEBPs directly from the old WordPress media library. If the old site goes down (or DNS flips), every one of these breaks.

Files affected:
- `src/pages/Index.tsx` — mission image + 6 Instagram feed images + sustainability badge
- `src/pages/AboutPage.tsx` — hero, story, sustainability images (3)
- `src/pages/VineyardPage.tsx` — hero + 3 vineyard tiles + Lodi badge
- `src/pages/WinesPage.tsx` — hero
- `src/pages/ContactPage.tsx` — hero
- `src/components/Seo.tsx` `DEFAULT_IMG` — sitewide OG fallback
- `index.html` — `og:image` and `twitter:image`

**Options (pick one):**
- **A.** Download each image, commit to `src/assets/migrated/`, import as ES modules. Pros: bundled, instant, no infra. Cons: ~12 image downloads, repo size grows.
- **B.** Upload to Supabase storage bucket `site-media`, reference by public URL. Pros: editable via CMS, lighter repo. Cons: needs bucket + RLS migration first.
- **C.** Hybrid — A for hero/static, B for the Instagram feed (so it can be refreshed without code).

The 6 Instagram images on the homepage are an extra question: do you want a real IG feed integration eventually, or are these manually curated forever? That decides B vs hand-managed.

## Bucket 2 — PDFs on the old site

`src/pages/AmbassadorsLandingPage.tsx` links two affiliate PDFs:
- `RDW_Affiliate-Program-Application-Walkthrough_2024-04.pdf`
- `RDW_Affiliate-Program-Tips_2024-01.pdf`

**Plan:** download both, store in `public/docs/ambassadors/`, link with `/docs/ambassadors/<file>.pdf` (relative). DNS-flip-safe.

Open question: are these PDFs still current, or should they be regenerated/replaced before relaunch?

## Bucket 3 — Absolute URLs in email templates & edge functions

Emails and server-side code have to use absolute URLs (no `/path` in inboxes). Today they hard-code `https://rescuedogwines.com`:
- `supabase/functions/create-gift-certificate/index.ts` — gift redemption link
- `supabase/functions/provision-reviewer/index.ts` — login + site URLs
- `supabase/functions/_shared/transactional-email-templates/ambassador-welcome.tsx`
- `supabase/functions/_shared/transactional-email-templates/reviewer-invite.tsx`
- `supabase/functions/_shared/transactional-email-templates/stale-accounts-{rep-alert,summary}.tsx`
- `supabase/functions/_shared/serverConversions.ts` — Meta CAPI `event_source_url`
- `supabase/functions/impact-health-check/index.ts` — pixel probe URL

**Plan:** introduce a single `PUBLIC_SITE_URL` secret (defaults to `https://shopify-buddy-b2b.lovable.app` until DNS flips, then update once to `https://rescuedogwines.com`). All templates/functions read `Deno.env.get("PUBLIC_SITE_URL")`. One source of truth, one switch on go-live.

## Bucket 4 — Rescue partner event links

`src/data/rescuePartners.ts` has 5 partner entries pointing at old `rescuedogwines.com/event/...` slugs. We don't have an `/event/<slug>` route in the new app yet.

**Options:**
- **A.** Drop the `url` field on those entries (no link until events are migrated).
- **B.** Build a minimal `/events/:slug` route + Supabase `events` table, then wire links to `/events/<slug>`.
- **C.** Leave as-is until events CMS lands (do nothing now).

Recommend A as the safe interim — no broken links, no scope creep. B can come with the events CMS work.

## Bucket 5 — SEO canonicals & JSON-LD

`Seo.tsx` (`SITE = "https://rescuedogwines.com"`), `jsonLd.tsx`, `index.html` canonical, and `PoliciesPage` JSON-LD all use `rescuedogwines.com`. **These should stay absolute and pointed at the future production domain** — that's exactly what canonicals are for. Nothing to migrate here. (If you'd rather they point at `shopify-buddy-b2b.lovable.app` until DNS flips, say so and I'll switch them.)

## What I need from you

1. **Bucket 1**: A, B, or C? (And: keep IG strip as static or wire a real feed?)
2. **Bucket 2**: confirm PDFs are still current, or supply replacements.
3. **Bucket 3**: OK to add a `PUBLIC_SITE_URL` secret? (Yes = I'll wire it.)
4. **Bucket 4**: A, B, or C?
5. **Bucket 5**: keep canonicals pointing to `rescuedogwines.com` (recommended), or switch to lovable.app for now?

Once you answer, I'll execute in one pass — Bucket 3 + 4 are quick, Bucket 1 + 2 are the bulk of the work.
