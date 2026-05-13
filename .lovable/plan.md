# Full Sitewide Translation

Combine **manual i18n keys** (fast, reliable) with an **AI auto-translate fallback** (covers everything else, including dynamic CMS/product copy) so every visible English string renders in FR/ES.

## What gets built

### 1. AI auto-translate fallback (the "covers everything" piece)
- New edge function `translate` (Lovable AI Gateway, model `google/gemini-2.5-flash-lite` — cheap, fast, great for short copy). Accepts `{ texts: string[], target: "fr"|"es" }`, returns translated array.
- New Supabase table `auto_translations` (key: source_text + lang) so each phrase is translated once and cached forever. Public read, service-role write.
- New `<T>English text</T>` component + `useAutoT()` hook:
  - If language === `en` → render as-is, zero cost.
  - Else look up cache (React Query), batch-fetch missing strings via the edge function, render translation when ready (English shown as fallback while loading — never blank).
- Batches requests in 250 ms windows so a page render with 40 strings = 1 API call, not 40.

### 2. Expand manual translations (high-traffic surfaces)
Wrap with existing `t()` and add keys to `en.json` / `fr.json` / `es.json`:
- **Footer** (newsletter CTA, link groups, legal)
- **Homepage `Index.tsx`** (hero headline/subhead, section titles, CTAs)
- **About / Mission** page section headings + lead paragraphs
- **CartDrawer** remaining strings (subtotal label, empty-cart copy)
- **AgeGate** modal

Manual keys stay free + instant; AI fallback handles everything else (product descriptions, blog posts, CMS-edited banners, ambassador bios, etc.).

### 3. Wire `<T>` into the noisy surfaces we won't manually translate
- ProductCard description, blog post bodies, CMS banner overrides, vineyard copy, donation form labels.

## Technical notes

- Edge function is `verify_jwt = false` (public) — it only translates user-visible marketing copy, no PII.
- Cache key is `sha256(source_text)` to keep rows compact and indexable.
- `<T>` accepts only plain string children — no nested JSX (keeps translation atomic and avoids breaking layout).
- React Query cache time = Infinity for translated strings (they don't change).
- Failure mode: if the edge call errors, original English is shown — site never breaks.

## Files

**New**
- `supabase/functions/translate/index.ts`
- `supabase/migrations/<ts>_auto_translations.sql`
- `src/components/T.tsx` (component + `useAutoT` hook + batching queue)

**Edited**
- `src/i18n/locales/{en,fr,es}.json` — add ~40 new keys
- `src/components/Footer.tsx`
- `src/pages/Index.tsx`
- `src/pages/AboutPage.tsx`
- `src/pages/MissionPage.tsx`
- `src/components/CartDrawer.tsx`
- `src/components/AgeGate.tsx`
- `src/components/ProductCard.tsx` (wrap description in `<T>`)

## Out of scope
- Translating user-generated content (reviews, ambassador free-text bios) on write — only on display.
- RTL languages (FR/ES are LTR).
- SEO `hreflang` tags — can add later if you want indexed FR/ES URLs.
