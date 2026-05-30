# Content & CMS Rules

*Sibling doc to `HERO_IMAGE_RULES.md`. Codifies what content is editable, by whom, and how.*

---

## 1. Core principle

**Anything not pulled from an external API at request time should be CMS-editable.**

This is the rule. Marketing copy, page sections, headlines, body content, press mentions, logos, calls-to-action, mission statements — all of it lives in a database table and is editable through the CMS UI by appropriately-permissioned users. Code-deploys are reserved for structural changes (new components, layout, behavior), not for fixing a typo or swapping a CTA.

Content that flows in from external APIs at request time is the exception:

- Wine product titles, descriptions, prices, inventory → Vinoshipper API → `wine_products` table
- Merch product data → Shopify API
- Rescue partner data → curated DB table (still editable via admin, but it's source-of-truth not marketing copy)
- Real-time data (sports scores, weather, etc.) → respective APIs

These stay API-flowing. Trying to override them at the CMS layer creates drift and breaks the upstream contract. (See `cms_overrides` on `wine_products` for the narrow exception where curated DB values intentionally diverge from API state — that pattern is opt-in per field and tracked explicitly.)

## 2. Permission tiers

Four tiers, ordered from highest to lowest authority:

| Role | Can edit |
|---|---|
| `owner` (Blair) | Everything. Can grant any role. Sole authority over `brand_owner` assignments. |
| `brand_owner` | Brand-critical surfaces: scheduled content, press mentions, markdown body fields, hero copy, mission claims, executive marketing copy. Assigned manually by `owner` via `/crm/admin/brand-owner-access`. |
| `admin` | Operational admin (data review, system config, dashboards). Does not edit marketing copy by default. |
| `cms_editor` | Basic CMS sections on the homepage (mission strip, club CTA, about us, lodi sustainability section). Operational copy updates. |
| `customer` | Public read-only. |

`owner` and `brand_owner` are deliberately distinct. The `owner` role represents business ownership (Blair as RDW founder/CEO). The `brand_owner` role is a delegated capability — assigned to specific trusted users for content management — that does not extend to system administration or role grants. Only `owner` can grant `brand_owner`.

Every `brand_owner` grant or revoke writes an audit log row to `brand_owner_access_log` (owner-only readable).

## 3. What's editable today

### Database-managed (CMS-editable)

- **Homepage CMS sections** via `cms_content` table: mission, club_cta, about_us, lodi (cms_editor+); additional sections to follow in Phase A migration (brand_owner+ for headlines and brand-critical copy, cms_editor for operational copy)
- **Hero variants** via `hero_variants` table managed at `/crm/admin/cms-heroes` (brand_owner+)
- **Press mentions** via `press_mentions` table managed at `/crm/admin/press-mentions` (brand_owner+)
- **Product field overrides** via `cms_overrides` on `wine_products` managed at `/crm/admin/sync-drift` (admin+)
- **Rescue partners** via `rescue_partners` table managed at `/crm/admin/rescue-partners` (admin+)
- **Brand owner access** via `user_roles` managed at `/crm/admin/brand-owner-access` (owner only)

### Hardcoded (NOT editable, pending Phase A+ migration)

- Homepage marketing copy beyond the 4 CMS sections — eyebrows, headlines, section intros, secondary CTAs, banners
- AboutPage entirely
- PressPage (FACTS, QUOTES, story angles)
- PoliciesPage (terms, privacy, returns, shipping)
- Header navigation labels and Footer copy
- Form labels, button text, error messages, modal text

Phase A migration moves the homepage gap to CMS. Phases B-D migrate the marketing pages and policies. Form labels and transactional copy remain hardcoded indefinitely — i18n-style key files are a better pattern for those.

## 4. The migration pattern

When converting a hardcoded section to CMS-editable:

1. **Identify the section's content shape.** Plain text? Headline + body? List of items? Rich markdown with links?
2. **Pick a `section_key`** for `cms_content`. Convention: `kebab-case`, descriptive of the section (e.g., `homepage-press-strip-header`, `about-founders-bio`).
3. **Wrap the section with `CmsEditButton`** referencing the section_key and field definitions.
4. **Replace the hardcoded string with `getCmsValue(content, section_key, field, fallback)`** — the fallback preserves DX and renders if no DB row exists.
5. **Pick the permission tier**:
   - Brand-critical (headlines, mission claims, executive copy, anything that affects brand voice or legal posture) → field requires `brand_owner+`
   - Operational (section descriptions, secondary CTAs, intro paragraphs) → field accepts `cms_editor+`
6. **Use `type: 'markdown'`** on the field if the content benefits from inline links, emphasis, or lists. The markdown editor is gated to `brand_owner+` only — `cms_editor` users see simple text inputs.

## 5. Scheduling

`cms_content` and `press_mentions` rows support `start_at` and `end_at` timestamps:

- Both nullable. Null means always-on for that bound.
- Filtered at read time: a row is "active" when `(start_at IS NULL OR start_at <= now()) AND (end_at IS NULL OR end_at > now())`.
- Constraint enforces `start_at < end_at` when both are set.
- If multiple rows match for the same `page + section_key`, the most recently updated wins.
- Schedule fields are visible/editable only to `brand_owner+`. `cms_editor` users see the dialog without schedule fields.

Use case: Mother's Day campaign hero copy variant runs May 1 – May 14. Set `start_at` and `end_at` accordingly; the system swaps to the default copy automatically after end_at passes.

## 6. Markdown body content

For body content with inline links, emphasis, or simple structure, use `body_md` field on `cms_content` rendered via `<CmsBody>{markdownString}</CmsBody>`.

Allowed markdown elements: paragraphs, bold, italic, links, lists, line breaks. The component sanitizes aggressively — no scripts, no inline styles, no iframes, no raw HTML.

Link behavior: cross-origin URLs open in a new tab with `rel="noopener noreferrer"`. Same-origin URLs stay in the current window.

For the press strip specifically, each logo can be wrapped in a clickable link via `article_url` on the press_mentions row. This converts the "As Featured In" strip from a claim into a verifiable proof point — visitors can click through to the actual published coverage.

## 7. Brand integrity hard lines

Inherited from `HERO_IMAGE_RULES.md` and applied to all content:

- Press mentions and "As Featured In" claims must be backed by verifiable published coverage. Never claim a feature that didn't happen.
- Logo usage requires either: (a) the outlet's approved press-kit version, or (b) a clean SVG from Wikipedia/Wikimedia Commons used in accurate factual context. Never substitute logos or use modified versions.
- Mission claims (50%-to-rescue, 150+ partners, $170k+ donated) must reflect current actual figures. The rescue partner ledger and donation log are the source of truth; the homepage cannot drift higher than what those ledgers support.
- Headlines, eyebrows, and executive copy require `brand_owner+` — operational `cms_editor` users cannot inadvertently change brand-voice content.

These constraints sometimes cost optimization headroom. They are not subject to ROAS trade-off discussions.

## 8. Process rules

**New copy added to TSX must use the CMS pattern from day one.** Any pull request or Lovable session that adds a hardcoded marketing string is a regression. The pattern is small (`useCmsContent` + `CmsEditButton` + fallback) — there's no good reason to skip it.

**New tables must go through migrations.** Diagnostic tables, probe tables, fingerprint helpers created via direct SQL execution outside the migration system escape RLS hygiene and create security exposures. (Cf. the `_kis_probe` finding from the May 29 security triage.) Every table creation goes through a migration file, gets reviewed, and includes `ENABLE ROW LEVEL SECURITY` from the start.

**Diagnostic infrastructure has a lifecycle.** Probe tables, debug edge functions, fingerprint helpers created during a debugging session must be torn down before the session closes — or documented in a TODO with an explicit expiration date. Don't leave diagnostic infrastructure in production indefinitely.

**Press mentions are append-only by convention.** Adding a new outlet requires (a) verified published coverage URL, (b) the outlet's authoritative logo, and (c) an entry via `/crm/admin/press-mentions`. Retired outlets get `status='retired'` rather than DELETE — preserves history.

## 9. Evolution

Current state is a hybrid: WordPress (Cloudways) attempted as source-of-truth, `cms_content` as fallback, hardcoded as final fallback. Writes target `cms_content` directly. The WordPress integration is half-built and may be deprecated in favor of full Supabase-native CMS, depending on editor preferences.

Future direction (deferred until current Phase A-D migrations complete):

- **i18n-style key files** for transactional copy (form labels, error messages, modal text) — `cms_content` is overkill for strings that change once a year
- **Supabase Storage-backed asset uploads** for press logos and hero images — eliminates the code-side asset map, makes the admin UI fully self-service
- **Versioning** on `cms_content` and `press_mentions` — preserve history, support rollback to prior versions, audit who-changed-what
- **Approval workflow** for `brand_owner+` content — `cms_editor` drafts a change, `brand_owner` reviews and publishes. Optional; only valuable at team scale.
- **Database-backed dynamic hero variants** with metadata-driven bandit selection — see Phase 1 of `autonomous_cro_optimization_roadmap.md`

These rules will be updated as the system evolves. The current document reflects state as of May 30, 2026.

## 10. Production-only content editing

Content editors work on the production site. Always.

Content lives in the production database. Edits made via the CMS UI on production are authoritative. Code deploys from dev do not overwrite content because seed migrations use `ON CONFLICT DO NOTHING` — existing rows are skipped, not overwritten. The architecture cleanly separates content (in the database) from code (in the repo); the two never mix.

Editing content on a dev preview environment (if one exists) puts the edits on dev's database, which is not the customer-facing source of truth. Those edits never reach production. Use dev preview for testing code changes; use production for editing content.

**Discipline rules for developers:**

- Migration files never `UPDATE` content table rows (`cms_content`, `press_mentions`, `hero_variants`, `donation_metrics`, `rescue_partners`). Any exception requires owner review.
- Seed inserts always use `ON CONFLICT DO NOTHING`. Never `ON CONFLICT DO UPDATE` for content tables.
- Schema changes that depend on data shape (NOT NULL constraints, type changes, etc.) get tested against a recent production snapshot or staging env before merging.
- Pre-publish migration sanity check: before any production deploy that includes new migrations, audit for the above and confirm no content-table UPDATE statements have slipped through.

**Discipline rules for content editors:**

- Bookmark the production CMS pages (e.g., `/crm/admin/press-mentions`, `/crm/admin/cms-heroes`). Don't navigate via dev preview links.
- For risky brand-critical changes (homepage hero copy during a launch, mission claims), preview in an incognito session before saving to verify the rendered result.
- Use the scheduling fields (`start_at` / `end_at`) for campaign content rather than coordinating timing with code releases.
- If a CMS edit appears to revert after a deploy, surface it immediately — that indicates a migration bug, not expected behavior.

---

*Version: 1.0 — May 30, 2026*
*Owner: Blair Lott (RDW)*
