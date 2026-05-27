## Goal

Two cleanups, one pass:

1. **Fix all 16 imported WordPress posts** — every row in `content_index` currently has the title `"Age Verification - Rescue Dog Wines"` because the original import used Firecrawl, which scraped the page's `<title>` tag after the age-gate modal had injected its own document title. The slugs, bodies, and excerpts are correct; only `title` (and likely `cover_image_url` for some) is wrong.
2. **Link the blog from the footer** — `/blog` is a working route but not linked anywhere in the public nav, so the 16 imported articles (and the Rescue Dog Month one in particular) are effectively orphaned.

## What I'll build

### 1. Re-pull titles from the real WordPress REST API

The existing `wp-import` edge function already reads `item.title.rendered` from `/wp-json/wp/v2/posts` — that's the clean H1 title, not a scrape. I'll add a small companion edge function `wp-refresh-titles` that:

- Reads every row in `content_index` where `source = 'wordpress'`.
- For each row, fetches `https://rescuedogwines.com/wp-json/wp/v2/posts?slug=<slug>&_embed=1`.
- Updates `title`, `excerpt`, `author`, `published_at`, and `cover_image_url` (re-hosting the featured image into the `blog-media` bucket if it isn't already a Supabase URL).
- Leaves `body_html` alone (already correct from Firecrawl).
- Admin/CMS-editor gated, same auth pattern as `wp-import`.
- Returns a JSON summary: `{ updated, skipped, failed, errors[] }`.

I'll then trigger it once from a small one-off CMS button (or you can hit it from the existing Import tab) so all 16 titles get corrected in one run. The function is idempotent — safe to re-run anytime.

### 2. Add `/blog` to the public footer

In `src/components/Footer.tsx`, add a "News & Stories" link to `/blog` under the existing nav column. Single line change — no design system impact.

### 3. Forward `rescuedogmonth.com` (you do this in GoDaddy)

Once titles are fixed, the canonical URL becomes:

```
https://rescuedogwines.com/blog/october-is-rescue-dog-month
```

In GoDaddy:

- My Products → `rescuedogmonth.com` → Domain Settings → **Forwarding** → Add forwarding.
- Forward to: `https://rescuedogwines.com/blog/october-is-rescue-dog-month`
- Type: **Permanent (301)**, **Forward only** (no masking).
- Save. Repeat for `www.rescuedogmonth.com`.

## What I won't touch

- `body_html` of any imported post — already clean from Firecrawl.
- The `content_redirects` table — the 301s from old WP paths are already in place.
- The Header nav — already crowded; "News & Stories" only goes in the footer.
- The CMS Content Library panel UI itself — bulk-editing 16 titles by hand isn't necessary now that we have a refresh function.

## Technical details

- **Why a new edge function instead of re-running `wp-import`?** `wp-import` wipes & re-imports based on `external_id`; some of the Firecrawl rows have no `external_id` populated, so a refresh-by-slug pass is cleaner and won't disturb the existing primary keys, redirects, or any manual edits.
- **WP REST source of truth:** `https://rescuedogwines.com/wp-json/wp/v2/posts?slug=<slug>&_embed=1` returns the real `title.rendered` (decoded HTML entities, no age-gate document-title pollution).
- **Image re-host:** if `cover_image_url` already starts with the Supabase public URL prefix, skip; otherwise download the WP `wp:featuredmedia` source and upload to `blog-media/post/<slug>-<id>.<ext>`.
- **Auth:** require `is_cms_editor` or `is_admin_or_owner` (same RPCs as `wp-import`).
- **Per-memory rule:** append a Lindy Manual changelog entry for the new `wp-refresh-titles` edge function in the same turn.

## Files touched

- `supabase/functions/wp-refresh-titles/index.ts` — new edge function.
- `src/components/Footer.tsx` — add "News & Stories" link to `/blog`.
- `/mnt/documents/Lindy_User_Manual_and_Roadmap.docx` — changelog entry for the new function.

## Verification

After implementation:

1. Call `wp-refresh-titles` once.
2. Re-query `content_index` and confirm 16 distinct, correct titles (e.g. `"October Is Rescue Dog Month"`).
3. Visit `/blog` and `/blog/october-is-rescue-dog-month` in preview — titles render correctly, footer link works.
4. You then complete the GoDaddy forwarding step.
