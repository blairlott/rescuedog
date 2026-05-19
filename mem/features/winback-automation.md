---
name: Winback automation
description: Tiered (60/120/240/365) winback audience sync across Mailchimp, Meta, Google + auto-recs into Kennel
type: feature
---
Nightly orchestrator (`kennel-nightly-ingest`) runs:
- `kennel-mailchimp-sync` — buckets every vs_transactions email (last 730d) into tier_60/120/240/365 + active_30d suppression, tags `signal_winback_*` / `exclude_active_30d` on the Mailchimp list. Writes snapshots to `winback_snapshots`.
- `kennel-winback-meta-sync` — SHA256-hashes emails per tier, upserts to 4 Meta Custom Audiences (auto-created on first run, IDs stored in `app_settings.winback_meta_audience_<tier>`).
- `kennel-winback-google-sync` — uploads to 4 Google Customer Match user lists via OfflineUserDataJobs (auto-created, IDs in `app_settings.winback_google_userlist_<tier>`).
- `kennel-winback-auto-recs` — when a tier+channel snapshot ≥ 250 members AND no rec/launch in 14d, creates a pending `ad_recommendations` row (kind=audience_update, source=native) for one-click approval. Idempotent via `ingest_request_id = winback:<channel>:<tier>:<YYYY-MM-DD>`.

Tables:
- `winback_snapshots` — daily tier sizes per channel.
- `winback_campaign_state` — cooldown state per tier+channel.

UI: `WinbackPanel` inside the Optimization console (mixing board dialog). Per-channel "Run now" buttons.
