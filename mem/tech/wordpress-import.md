---
name: WordPress Import
description: Edge function and CMS UI to migrate Cloudways WordPress posts/pages/events into Lovable
type: feature
---
- Edge fn `wp-import` hits `{site}/wp-json/wp/v2/{post_type}?_embed=1&status=publish`, paginates 50 at a time, re-hosts featured images to the `blog-media` storage bucket (public), and upserts into `content_index` keyed on (`source='wordpress'`, `external_id`).
- Writes 301 redirects to `content_redirects` from old WP path → new `/blog/<slug>` (or `/events`, `/`) so SEO survives Cloudways shutdown.
- Tracks every run in `wp_import_runs` (visible in CMS dashboard → Import tab).
- Auth: requires CMS editor or admin/owner role.
- Presets: posts, pages, tribe_events (Events Calendar plugin), generic events. Custom post types work via the same edge fn.
- Public storage bucket `blog-media`; only CMS editors can write.
