# AI Creative Studio — `/kennel/creative-studio`

A self-service creative workbench that turns one source image (or short clip) into a full set of platform-ready assets, copy variants, and branded Ken Burns videos. Every output lands back in the existing CMS Media Library so Lindy and the platform APIs can pull from one place.

## What the user gets

1. **Upload** one or more source images (or pick existing assets from CMS Media).
2. **Pick brand lockup per asset**: Wine (Black RDW logo, red #c30017) or Merch (HD Rescue Dog logo). Toggle per upload.
3. **Pick destinations** (multi-select): Meta Feed 1:1, Meta Story/Reels 9:16, Pinterest 2:3, TikTok 9:16, YouTube 16:9, YouTube Short 9:16, Google Display 1.91:1, Email Hero 16:9, Web Hero 21:9, Carrot/Instacart 1:1, OOH 4:3.
4. **Pick output types**: Static image set, Copy/headline/CTA iterations (3–5 variants), Ken Burns MP4 (5s / 10s / 15s with pan-zoom + logo lockup + optional caption + optional music bed).
5. **Generate**. Progress shown per output. Results gallery with preview, download, "Send to CMS Media", and "Push to platform" (queues for the Media Buying console).

## Pipeline

```text
 Source image ──► Reformat job ──► Per-ratio AI recompose ──► Brand overlay ──► Save to Media
                       │
                       ├──► Copy iterations (Lovable AI) ──► Variant cards
                       │
                       └──► Ken Burns render ──► MP4 (pan+zoom keyframes, logo, caption, music) ──► Save to Media
```

- **AI reformat / recompose**: Lovable AI Gateway, `google/gemini-3.1-flash-image-preview` (Nano Banana 2) — edit_image style call with prompt "Recompose for {ratio}, keep subject centered, extend background tastefully, no text." One call per selected ratio.
- **Copy iterations**: `google/gemini-3-flash-preview` with structured output (zod) — returns `{ headline, subhead, cta, caption, hashtags[] }` × N variants, tone presets: Mission, Product, Urgency, Story.
- **Ken Burns video**: Rendered server-side in an edge function using ffmpeg via `zoompan` filter on the recomposed still, with a PNG logo overlay (drawn from the chosen brand lockup), optional caption burn-in (drawtext), and an optional royalty-free music bed from a curated bucket. Output H.264 MP4, target ratio matches selected destination.
- **Brand overlay**: Composited at render time. Wine lockup = Black RDW logo bottom-left + red #c30017 1px hairline; Merch lockup = HD Rescue Dog logo bottom-left. Safe-area aware per platform.

## Data model (new tables)

- `creative_jobs` — id, user_id, source_asset_url, brand_lockup ('wine'|'merch'), destinations[], output_types[], status, created_at
- `creative_outputs` — id, job_id, kind ('image'|'video'|'copy'), platform, ratio, url (Supabase Storage), meta (jsonb: copy fields, duration, etc.), status
- Storage bucket: `creative-studio` (public read, authed write).
- Brand assets bucket: `brand-lockups` seeded with both logos.

## Edge functions

- `creative-reformat` — takes source + ratio list, calls Nano Banana 2 per ratio, writes results to storage, inserts `creative_outputs` rows.
- `creative-copy-iterate` — takes source description + tone presets, returns N copy variants.
- `creative-kenburns-render` — takes source, ratio, duration, brand_lockup, caption?, music?, runs ffmpeg (Deno binary) to produce MP4, uploads to storage.

ffmpeg note: Deno edge runtime can't run ffmpeg natively. Two viable paths — (a) shell out using a hosted render worker via fly.io/Railway, or (b) use a third-party render API (Shotstack/Creatomate). **Default to option (b)** with Creatomate (single API key, JSON template) so we don't stand up new infra. If you'd rather self-host, swap to a Railway worker — same edge-function interface, different backend.

## UI (`src/pages/kennel/KennelCreativeStudioPage.tsx`)

- Step 1: Drop zone + "Pick from Media" picker.
- Step 2: Per-asset brand toggle (Wine / Merch).
- Step 3: Destination chips (grouped: Social, Display, Video, Email, OOH, Retail).
- Step 4: Output type toggles + Ken Burns options (duration, caption text, music on/off).
- Step 5: Generate. Live progress per output. Results grid with preview, copy text, download, "Save to CMS", "Queue for platform".
- Sidebar: recent jobs list, regenerate, duplicate-with-tweaks.

## Routes & nav

- Route: `/kennel/creative-studio`.
- Sidebar link "Creative Studio" (Sparkles icon) under the existing CMS / Media group in `KennelLayout.tsx`.

## Secrets

- `LOVABLE_API_KEY` — already present (image + copy).
- `CREATOMATE_API_KEY` — new, only if you greenlight the third-party render path. I'll prompt for it right before wiring the Ken Burns function.

## Out of scope (this round)

- Auto-pushing creatives into ad accounts (that's the Media Buying console once seats are API-connected).
- Video-to-video reformat (source must be image for Ken Burns).
- Audio sync / lipsync.

## Question before I build

**Ken Burns render backend**: Creatomate (fastest, ~$0.05/render, one API key) **or** stand up a small Railway worker (free-ish, more setup, you own the pipeline)? Reply "Creatomate" or "Railway" and I'll start.