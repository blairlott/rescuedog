/**
 * v3 dropship-bridge feature flag.
 *
 * /v3 = unified Vinoshipper checkout (wine + non-wine merch) with a
 * server-side fork that hands non-wine line items to dropship partners
 * (Printify, Printful, partner_direct) while VS remains merchant-of-record.
 *
 * Off by default. Flip via VITE_V3_DROPSHIP_ENABLED=true in preview/dev.
 */
export const V3_DROPSHIP_ENABLED =
  (import.meta.env.VITE_V3_DROPSHIP_ENABLED ?? "true") !== "false";