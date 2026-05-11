---
name: Pairings & AI Sommelier
description: PDP pairing chips, reverse pairing widget, and CMS-managed recipe pairings
type: feature
---
# Wine Pairing System

Three integrated surfaces for wine pairing, all powered by the AI Sommelier (`ai-sommelier` edge function).

## Sommelier event API
`SommelierChat` listens for window event `rdw:sommelier-open` with optional `{ prompt }` detail. Any component can dispatch it to open the chat with a pre-filled question.

## PDP pairing chips (`PairingChips.tsx`)
Reads Shopify tags prefixed `pairs:`, `pairing:`, or `food:` (e.g. `pairs:steak`). Renders chips + "What pairs with this?" CTA on each product detail page.

## Reverse pairing widget (`PairingFinder.tsx`)
Homepage section. "What's for dinner?" input → asks sommelier to recommend 1-3 wines from catalog.

## Recipes & wine pairing pages
- Public routes: `/pairings` and `/pairings/:slug`
- Table: `recipes` (slug, title, excerpt, body_html, cover_image, recommended_product_handle, pairing_notes, published)
- Each recipe links to a Shopify product handle for shop CTA
- Managed in CMS Dashboard → Pairings tab (requires `is_cms_editor`)
