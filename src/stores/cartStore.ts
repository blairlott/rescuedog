import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { CartItem, ShopifyProduct, buildVinoshipperCheckoutUrl } from "@/lib/shopify";

export type { CartItem, ShopifyProduct };

interface CartStore {
  items: CartItem[];
  cartId: string | null;
  checkoutUrl: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  addItem: (item: Omit<CartItem, "lineId">) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clearCart: () => void;
  syncCart: () => Promise<void>;
  getCheckoutUrl: () => string | null;
}

/**
 * Lovable-native local cart. Items live in localStorage; checkout for wine
 * items hands off to Vinoshipper (compliance + payment). Merch checkout is
 * not yet wired (no payment provider).
 */
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      cartId: null,
      checkoutUrl: null,
      isLoading: false,
      isSyncing: false,

      addItem: async (item) => {
        const existing = get().items.find(i => i.variantId === item.variantId);
        if (existing) {
          set({
            items: get().items.map(i =>
              i.variantId === item.variantId
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
          });
        } else {
          set({ items: [...get().items, { ...item, lineId: item.variantId }] });
        }
      },

      updateQuantity: async (variantId, quantity) => {
        if (quantity <= 0) { await get().removeItem(variantId); return; }
        set({ items: get().items.map(i => i.variantId === variantId ? { ...i, quantity } : i) });
      },

      removeItem: async (variantId) => {
        const next = get().items.filter(i => i.variantId !== variantId);
        next.length === 0 ? get().clearCart() : set({ items: next });
      },

      clearCart: () => set({ items: [], cartId: null, checkoutUrl: null }),

      // Returns wine deep-link if any wine items are present. Merch checkout
      // is handled separately by the cart drawer (placeholder for now).
      getCheckoutUrl: () => buildVinoshipperCheckoutUrl(get().items),

      // No remote cart to sync — kept as a no-op for API compatibility.
      syncCart: async () => {},
    }),
    {
      name: "rdw-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items, cartId: s.cartId, checkoutUrl: s.checkoutUrl }),
    }
  )
);
