---
name: Subscribe & Save vs Wine Club
description: S&S is single-product auto-ship, not a club membership; never stack with Wine Club discounts
type: feature
---
- Subscribe & Save = recurring auto-ship of a single SKU at a frequency. NOT a club membership.
- No club perks (curated shipments, member releases, event access) come with S&S.
- S&S discounts cannot be combined or stacked with Wine Club member pricing.
- UI: if user `isMember`, hide/disable the S&S toggle in cart and show explanatory note. Existing `checkoutIntent` "subscribe" vs "club" mutual exclusion still applies for non-members.
- Disclaimer copy lives in `src/components/WineClubDisclaimer.tsx` (subscription variant).
