import { create } from "zustand";

/**
 * Tracks which checkout-time discount the customer is opting into.
 * Wine Club join (20%) and Subscribe & Save (up to 15%) cannot stack —
 * Vinoshipper applies club pricing automatically and recurring SKU
 * discounts can't be combined with member pricing.
 */
export type CheckoutDiscountIntent = "none" | "club" | "subscribe";

interface CheckoutIntentStore {
  intent: CheckoutDiscountIntent;
  clubTierId: string | null;
  setIntent: (next: CheckoutDiscountIntent) => void;
  setClubTierId: (id: string | null) => void;
  reset: () => void;
}

export const useCheckoutIntentStore = create<CheckoutIntentStore>((set) => ({
  intent: "none",
  clubTierId: null,
  setIntent: (next) => set({ intent: next }),
  setClubTierId: (id) => set({ clubTierId: id }),
  reset: () => set({ intent: "none", clubTierId: null }),
}));