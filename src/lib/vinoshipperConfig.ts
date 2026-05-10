/**
 * Vinoshipper Injector configuration.
 *
 * Until the real Account ID + Injector script are in place, the wine cart and
 * club signup operate in SIMULATION mode — fake checkout overlay, fake card,
 * fake "webhook" written to vinoshipper_webhook_logs so the rest of the
 * pipeline (membership row, discount sync) can be exercised end-to-end.
 *
 * To go live (after May 18 once Account ID + API keys are in hand):
 *   1. Set VS_SIMULATION = false
 *   2. Set VS_ACCOUNT_ID to the real numeric ID
 *   3. Add `vinoshipper_product_id` metafield on each Shopify wine product
 *   4. Drop <script src={VS_INJECTOR_SRC}> into index.html
 */
export const VS_SIMULATION = true;
export const VS_ACCOUNT_ID = "REPLACE_ME";
export const VS_INJECTOR_SRC = "https://vinoshipper.com/injector/index.js";

/** Flat shipping for orders under the threshold; included at/above. */
export const VS_SHIPPING_THRESHOLD_BOTTLES = 6;
export const VS_FLAT_SHIPPING_USD = 9.99;

/** Member discount applied when a Vinoshipper customer is identified. */
export const VS_MEMBER_DISCOUNT_PERCENT = 20;