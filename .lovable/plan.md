# Membership Origin Tracking + Full Member Customization

Skipping legacy member migration for now. Legacy VS members continue to manage on Vinoshipper directly until we revisit. This plan covers (1) lightweight origin tracking so we don't lose track of who's who when we DO migrate later, and (2) full member customization for app-originated memberships.

---

## 1. Origin tracking (minimal)

Add to `wine_club_memberships`:

- `origin` text NOT NULL DEFAULT `'app_join'` — `'vinoshipper_legacy' | 'app_join' | 'app_curated_gift' | 'admin_manual'`
- `app_tier_config_id` uuid NULL — FK to `wine_club_tiers` (null for legacy until mapped)
- `imported_at` timestamptz NULL — set if discovered via webhook with no prior app row

Webhook (`vinoshipper-webhook` CLUB_MEMBERSHIP/CREATED):
- If row exists → update status only.
- If missing → INSERT with `origin = 'vinoshipper_legacy'`, `imported_at = now()`, `app_tier_config_id = NULL`.

Edge fns that create memberships in-app (`vinoshipper-create-membership`, `create-gift-certificate`) write the appropriate `origin` + `app_tier_config_id`.

That's it for now — no migration UI, no auto-linking of historic VS memberships, no member-facing legacy banner.

---

## 2. Full member customization (app-originated only)

Members on `origin = 'app_join'` (or `'app_curated_gift'`) get full per-shipment control. Only constraint: bottle count ≥ tier `min_bottles`.

### Schema additions

- `wine_club_shipments` (new): id, membership_id, scheduled_ship_date, status (`scheduled | member_customized | locked | shipped | skipped`), locked_at, vinoshipper_order_id, total_cents, created_at, updated_at
- `wine_club_shipment_items` (new): id, shipment_id, wine_product_id, quantity, unit_price_cents, source (`curator_default | member_pick`)
- RLS: member can SELECT/UPDATE own shipment + items where `status NOT IN ('locked','shipped')`; admin/wine_club_manager full access.

Reuse existing `wine_club_tiers.min_bottles`.

### UI: `/account/wine-club` → "Next Shipment"

New component `NextShipmentCustomizer`:

- Lists items with: thumb, name, varietal, price, qty stepper, swap button, remove button.
- "Add a wine" opens drawer of in-catalog wines (filtered to ship-to-state via `wineShippingStates`).
- Live totals + member-discount preview.
- Skip-this-shipment button (1 cycle) — uses existing `wine-club-membership-action` `pause` flow.
- Cutoff banner: "Locks 7 days before ship date" — disables editing once `locked_at` is set.
- Save button calls new edge fn `wine-club-shipment-save`.

### Validation (server)

New edge fn `wine-club-shipment-save`:
- Verifies caller owns the membership.
- Rejects if total bottles < tier `min_bottles` → 400 with friendly message.
- Rejects if shipment status is `locked|shipped`.
- Writes items, sets shipment status to `member_customized`, recalculates total.
- Writes `wine_club_events` row (`event_type = 'shipment_customized'`).

### Curator workflow

Curator's default-shipment proposal still seeds items. `MemberDashboard` and `WineClubAdminPage` flag shipments where `source` mix includes `member_pick` so curator doesn't overwrite without confirmation.

---

## 3. Disclaimer copy

Append to `WineClubDisclaimer` (`variant="club"`):

> "You can fully customize each shipment in your account up to 7 days before the ship date — swap, add, or remove bottles, as long as you stay at or above your tier's minimum bottle count."

---

## Out of scope (this round)

- Importing or auto-linking legacy VS memberships.
- Migrating billing off Vinoshipper.
- Customization for `vinoshipper_legacy` rows — those keep being managed on VS until we run the migration project later.

## Build order

1. Migration: add `origin`, `app_tier_config_id`, `imported_at` columns; backfill existing rows; update webhook + create-membership edge fn.
2. Migration: create `wine_club_shipments` + `wine_club_shipment_items` with RLS.
3. Edge fn `wine-club-shipment-save` with min-volume validation.
4. `NextShipmentCustomizer` UI in account dashboard.
5. Update `WineClubDisclaimer` copy.
6. Save updated wine-club memory note reflecting "legacy migration deferred; app-originated members get full customization above tier minimum."
