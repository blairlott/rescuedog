/**
 * Wine bundle helpers — matches Vinoshipper's "Excluded from Discounts"
 * rule for the 6-Bottle Sampler / Mother's Day 6 Pack.
 * Each bundle item counts as 6 bottles toward the shipping-included
 * threshold and is excluded from the 20% member discount.
 */
const BUNDLE_HANDLES = new Set([
  "mothers-day-6-pack",
  "6-bottle-sampler",
]);

export const BOTTLES_PER_BUNDLE = 6;

export function isBundleHandle(handle?: string | null): boolean {
  if (!handle) return false;
  return BUNDLE_HANDLES.has(handle.toLowerCase());
}

export interface BottleCountable {
  product: { node: { handle?: string; productKind?: string } };
  quantity: number;
}

/** Total WINE bottles across cart, expanding bundles to 6 each. Merch is excluded. */
export function effectiveBottleCount<T extends BottleCountable>(items: T[]): number {
  return items.reduce((sum, i) => {
    if (i.product.node.productKind && i.product.node.productKind !== "wine") return sum;
    const per = isBundleHandle(i.product.node.handle) ? BOTTLES_PER_BUNDLE : 1;
    return sum + per * i.quantity;
  }, 0);
}

export interface DiscountableItem extends BottleCountable {
  price: { amount: string };
}

/** Wine subtotal eligible for member discount (bundles + merch excluded). */
export function discountEligibleSubtotal<T extends DiscountableItem>(items: T[]): number {
  return items.reduce((sum, i) => {
    if (i.product.node.productKind && i.product.node.productKind !== "wine") return sum;
    if (isBundleHandle(i.product.node.handle)) return sum;
    return sum + parseFloat(i.price.amount) * i.quantity;
  }, 0);
}