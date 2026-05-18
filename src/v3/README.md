# /v3 — Vinoshipper Unified Cart + Dropship Bridge (sandbox)

Mirrors `/v2`'s isolation pattern. Production code is untouched until the
flag flips. See `mem/specs/v3-vs-dropship-bridge-spec.md` and
`mem/plans/v3-dropship-bridge.md`.

Routes (flag-gated by `VITE_V3_DROPSHIP_ENABLED`):
- `/v3` — landing / overview
- `/v3/shop` — unified wine + merch grid (VS Injector add-to-cart for both)
- `/v3/merch` — non-wine-only catalog mirrored from existing dropship partners
- `/v3/cart` — uses `cartStoreV3` (separate localStorage key)
- `/v3/checkout/success` — post-VS-checkout landing
- `/v3/admin/migration` — preview of Shopify → VS non-wine SKU migration plan