---
name: Site Intelligence + Autopilot
description: Heatmap, scroll, attention, rage-click tracker + nightly autopilot promoting bandit winners and personalization rules
type: feature
---
Client tracker: src/lib/siteIntel.ts mounted via src/components/SiteIntelTracker.tsx in App.tsx. Skips /crm /cms /kennel /admin /account routes. Flushes to public.site_intel_events every 8s. Tracks clicks (x/y %), 2s mouse samples, scroll thresholds (25/50/75/100), rage clicks (3+ within 1s + 60px), section_view + page_attention via IntersectionObserver on every <section> or [data-section].

Autopilot: supabase/functions/site-autopilot-nightly. Cron 09:15 UTC. Promotes experiment winners when total exposures ≥ 200/variant and lift ≥ 10% over control — sets experiments.winner_variant_id, status=completed, and inserts a personalization_rules row with source='autopilot'. Flags rage hotspots (≥5/7d) and low-attention sections (<800ms avg dwell). All decisions logged to site_intel_decisions.

Admin UI: /kennel/site-intel — click heatmap viewer, rage hotspots, section dwell, decision log, manual "Run autopilot now" button (admin JWT auth or x-ingest-secret).

To add a new experiment slot: create row in experiments + variants tables; wrap surface with useExperiment(slotKey, defaultConfig). Already wired via existing useExperiment hook — no per-page integration needed for new slots.
