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

/**
 * Wine shipping policy (updated May 2026):
 *   - Under 6 bottles: standard variable shipping (Vinoshipper-calculated)
 *   - 6–11 bottles: flat $9.99
 *   - 12+ bottles (full case): shipping included
 */
export const VS_SHIPPING_THRESHOLD_BOTTLES = 12;
export const VS_FLAT_SHIPPING_MIN_BOTTLES = 6;
export const VS_FLAT_SHIPPING_USD = 9.99;

/** Member discount applied when a Vinoshipper customer is identified. */
export const VS_MEMBER_DISCOUNT_PERCENT = 20;