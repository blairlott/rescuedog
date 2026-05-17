import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * v2 cart — unified Shopify cart for wine + merch.
 *
 * Intentionally separate from `src/stores/cartStore.ts` so production traffic
 * and v2 QA traffic never collide. Persists to its own localStorage key.
 */
export interface V2CartItem {
  lineId: string | null;
  variantId: string;
  productHandle: string;
  title: string;
  variantTitle: string;
  price: { amount: string; currencyCode: string };
  quantity: number;
  /** "wine" requires VS compliance + fulfillment; "merch" is Shopify-only. */
  fulfillmentChannel: "wine" | "merch";
  image?: string;
}

export interface V2ComplianceToken {
  token: string;
  expiresAt: number; // epoch ms
  shipToState: string;
  shipToZip: string;
  taxesCents: number;
  feesCents: number;
  shippingCents: number;
}

interface V2CartState {
  items: V2CartItem[];
  cartId: string | null;
  checkoutUrl: string | null;
  compliance: V2ComplianceToken | null;
  setCompliance: (c: V2ComplianceToken | null) => void;
  clear: () => void;
}

export const useCartStoreV2 = create<V2CartState>()(
  persist(
    (set) => ({
      items: [],
      cartId: null,
      checkoutUrl: null,
      compliance: null,
      setCompliance: (compliance) => set({ compliance }),
      clear: () => set({ items: [], cartId: null, checkoutUrl: null, compliance: null }),
    }),
    {
      name: "rdw-cart-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        items: s.items,
        cartId: s.cartId,
        checkoutUrl: s.checkoutUrl,
        compliance: s.compliance,
      }),
    },
  ),
);