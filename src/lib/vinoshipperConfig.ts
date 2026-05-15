/**
 * Vinoshipper Injector configuration.
 *
 * Architecture:
 *   - Injector = canonical checkout (PCI, payment, age verify, tax, shipping,
 *     recurring club billing). We never POST orders from our backend.
 *   - REST API (server-side, edge functions) = UX enrichment ONLY:
 *     live stock, customer linking, webhook ingestion, club reads.
 */
export const VS_SIMULATION = false;
export const VS_ACCOUNT_ID = "2212";
export const VS_INJECTOR_SRC = "https://vinoshipper.com/injector/index.js";

/** Flat shipping for orders under the threshold; included at/above. */
export const VS_SHIPPING_THRESHOLD_BOTTLES = 6;
export const VS_FLAT_SHIPPING_USD = 9.99;

/** Member discount applied when a Vinoshipper customer is identified. */
export const VS_MEMBER_DISCOUNT_PERCENT = 20;