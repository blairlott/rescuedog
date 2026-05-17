# v2 — Unified Shopify + Vinoshipper checkout (TEST)

Sandbox for the unified-checkout rebuild. Nothing in `src/v2/` may be imported
from outside this directory. The live wine site and `/merch` flow are
untouched.

- Routes: `/v2`, `/v2/shop`, `/v2/product/:handle`, `/v2/cart`,
  `/v2/checkout/verify`, `/v2/checkout/success`
- Cart store: `cartStoreV2` (own localStorage key `rdw-cart-v2`)
- Edge fn: `vs-compliance-check` (stub today, real VS call later)
- Feature flag: `VITE_V2_STORE_ENABLED` (`true` to expose routes; otherwise 404)

See `mem://plans/v2-unified-checkout.md` for the full plan.