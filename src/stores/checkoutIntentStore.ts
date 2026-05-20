import { create } from "zustand";

/**
 * Tracks which checkout-time discount the customer is opting into.
 * Wine Club join (20%) and Subscribe & Save (up to 20%, tiered by cart subtotal) cannot stack —
 * Vinoshipper applies club pricing automatically and recurring SKU
 * discounts can't be combined with member pricing.
 *
 * Stackable WITH member 20%: full-case discount, and any seasonal promo
 * code flagged `stacks_with_member_discount = true` in the admin.
 * See mem://features/member-stacking-rules.
 */
export type CheckoutDiscountIntent = "none" | "club" | "subscribe";

interface CheckoutIntentStore {
  intent: CheckoutDiscountIntent;
  clubTierId: string | null;
  giftEnabled: boolean;
  giftRecipientName: string;
  giftMessage: string;
  setIntent: (next: CheckoutDiscountIntent) => void;
  setClubTierId: (id: string | null) => void;
  setGift: (next: { enabled?: boolean; recipientName?: string; message?: string }) => void;
  reset: () => void;
}

export const useCheckoutIntentStore = create<CheckoutIntentStore>((set) => ({
  intent: "none",
  clubTierId: null,
  giftEnabled: false,
  giftRecipientName: "",
  giftMessage: "",
  setIntent: (next) => set({ intent: next }),
  setClubTierId: (id) => set({ clubTierId: id }),
  setGift: (next) =>
    set((s) => ({
      giftEnabled: next.enabled ?? s.giftEnabled,
      giftRecipientName: next.recipientName ?? s.giftRecipientName,
      giftMessage: next.message ?? s.giftMessage,
    })),
  reset: () => set({ intent: "none", clubTierId: null, giftEnabled: false, giftRecipientName: "", giftMessage: "" }),
}));