---
name: Wine Club Member Customization
description: App-originated members fully customize each shipment above tier minimum; legacy VS members managed in Vinoshipper.
type: feature
---
Membership rows carry an `origin` column: `vinoshipper_legacy | app_join | app_curated_gift | admin_manual`.

**App-originated members (`app_join`, `app_curated_gift`, `admin_manual`):**
- Can add, remove, swap, and change quantities on any upcoming `wine_club_shipments` row that isn't `locked|shipped|cancelled`.
- Only constraint: total bottle count must be ≥ `wine_club_tiers.bottle_count` (tier minimum).
- Customization saved via `wine-club-shipment-save` edge fn → status flips to `customer_customized`.
- Skip-this-shipment writes status `skipped` (membership stays active).

**Legacy members (`vinoshipper_legacy`):**
- Customization disabled in app (managed directly in Vinoshipper). Auto-migration is deferred.

UI: `NextShipmentCustomizer` in `MemberDashboard` (mounted on `/account` wine club tab).
