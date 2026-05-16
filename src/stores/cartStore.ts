import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  CartItem,
  ShopifyProduct,
  buildVinoshipperCheckoutUrl,
  shopifyCartCreate,
  shopifyCartLinesAdd,
  shopifyCartLineUpdate,
  shopifyCartLineRemove,
  shopifyCartFetch,
  shopifyCartDiscountCodesUpdate,
} from "@/lib/shopify";
import { analytics } from "@/lib/analytics";

export type { CartItem, ShopifyProduct };

interface CartStore {
  items: CartItem[];
  /** Shopify cart id for merch lines (gid://shopify/Cart/...). */
  shopifyCartId: string | null;
  /** Shopify hosted checkout URL for merch lines. */
  shopifyCheckoutUrl: string | null;
  /** Discount codes currently attached to the Shopify cart (server-confirmed applicable). */
  discountCodes: string[];
  isLoading: boolean;
  isSyncing: boolean;
  addItem: (item: Omit<CartItem, "lineId">) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clearCart: () => void;
  syncCart: () => Promise<void>;
  /** Apply a Shopify discount code (e.g. "PAIRIT10"). No-op if no Shopify cart yet. */
  applyDiscountCode: (code: string) => Promise<boolean>;
  /** Strip all discount codes from the Shopify cart. */
  clearDiscountCodes: () => Promise<void>;
  /** Vinoshipper deep-link for wine items (legacy compat). */
  getCheckoutUrl: () => string | null;
  /** Shopify hosted checkout URL for merch items. */
  getShopifyCheckoutUrl: () => string | null;
}

const isMerch = (i: { product: ShopifyProduct }) => i.product.node.productKind !== "wine";
const isWine = (i: { product: ShopifyProduct }) => i.product.node.productKind === "wine";

/**
 * Hybrid cart:
 *  - Wine items: local-only, hand off to Vinoshipper at checkout (compliance + payment)
 *  - Merch items: mirror to a real Shopify cart via Storefront API, hand off to Shopify checkout
 */
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      shopifyCartId: null,
      shopifyCheckoutUrl: null,
      discountCodes: [],
      isLoading: false,
      isSyncing: false,

      addItem: async (item) => {
        const existing = get().items.find(i => i.variantId === item.variantId);

        // Analytics: GA4 add_to_cart (fans out via GTM to Meta/TikTok/Pinterest).
        analytics.addToCart({
          item_id: item.variantId,
          item_name: item.product.node.title,
          item_category: (item.product.node.productKind ?? "wine") as "wine" | "merch",
          item_variant: item.variantTitle,
          price: Number(item.price?.amount ?? 0),
          quantity: item.quantity,
        });

        // Wine: local only.
        if (isWine(item)) {
          if (existing) {
            set({
              items: get().items.map(i =>
                i.variantId === item.variantId
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i,
              ),
            });
          } else {
            set({ items: [...get().items, { ...item, lineId: item.variantId }] });
          }
          return;
        }

        // Merch: mirror to Shopify cart.
        set({ isLoading: true });
        try {
          const { shopifyCartId } = get();

          if (existing && existing.lineId) {
            const newQty = existing.quantity + item.quantity;
            const r = await shopifyCartLineUpdate(shopifyCartId!, existing.lineId, newQty);
            if (r.cartNotFound) {
              get().clearCart();
              return get().addItem(item);
            }
            if (r.success) {
              set({
                items: get().items.map(i =>
                  i.variantId === item.variantId ? { ...i, quantity: newQty } : i,
                ),
              });
            }
          } else if (!shopifyCartId) {
            const result = await shopifyCartCreate(item.variantId, item.quantity);
            if (result) {
              set({
                shopifyCartId: result.cartId,
                shopifyCheckoutUrl: result.checkoutUrl,
                items: [...get().items, { ...item, lineId: result.lineId }],
              });
            }
          } else {
            const r = await shopifyCartLinesAdd(shopifyCartId, item.variantId, item.quantity);
            if (r.cartNotFound) {
              get().clearCart();
              return get().addItem(item);
            }
            if (r.success) {
              set({
                items: [...get().items, { ...item, lineId: r.lineId ?? item.variantId }],
              });
            }
          }
        } catch (err) {
          console.error("[cart] addItem failed:", err);
        } finally {
          set({ isLoading: false });
        }
      },

      updateQuantity: async (variantId, quantity) => {
        if (quantity <= 0) {
          await get().removeItem(variantId);
          return;
        }
        const item = get().items.find(i => i.variantId === variantId);
        if (!item) return;

        if (isWine(item)) {
          set({
            items: get().items.map(i => (i.variantId === variantId ? { ...i, quantity } : i)),
          });
          return;
        }

        const { shopifyCartId } = get();
        if (!item.lineId || !shopifyCartId) return;
        set({ isLoading: true });
        try {
          const r = await shopifyCartLineUpdate(shopifyCartId, item.lineId, quantity);
          if (r.cartNotFound) {
            get().clearCart();
            return;
          }
          if (r.success) {
            set({
              items: get().items.map(i => (i.variantId === variantId ? { ...i, quantity } : i)),
            });
          }
        } finally {
          set({ isLoading: false });
        }
      },

      removeItem: async (variantId) => {
        const item = get().items.find(i => i.variantId === variantId);
        if (!item) return;

        analytics.removeFromCart({
          item_id: item.variantId,
          item_name: item.product.node.title,
          item_category: (item.product.node.productKind ?? "wine") as "wine" | "merch",
          item_variant: item.variantTitle,
          price: Number(item.price?.amount ?? 0),
          quantity: item.quantity,
        });

        if (isWine(item)) {
          const next = get().items.filter(i => i.variantId !== variantId);
          if (next.length === 0) get().clearCart();
          else set({ items: next });
          return;
        }

        const { shopifyCartId } = get();
        if (item.lineId && shopifyCartId) {
          set({ isLoading: true });
          try {
            const r = await shopifyCartLineRemove(shopifyCartId, item.lineId);
            if (r.cartNotFound) {
              get().clearCart();
              return;
            }
          } finally {
            set({ isLoading: false });
          }
        }
        const next = get().items.filter(i => i.variantId !== variantId);
        const stillHasMerch = next.some(isMerch);
        if (next.length === 0) {
          get().clearCart();
        } else if (!stillHasMerch) {
          // No merch left → drop Shopify cart pointer; keep wine items.
          set({ items: next, shopifyCartId: null, shopifyCheckoutUrl: null });
        } else {
          set({ items: next });
        }
      },

      clearCart: () =>
        set({ items: [], shopifyCartId: null, shopifyCheckoutUrl: null, discountCodes: [] }),

      getCheckoutUrl: () => buildVinoshipperCheckoutUrl(get().items),
      getShopifyCheckoutUrl: () => get().shopifyCheckoutUrl,

      applyDiscountCode: async (code) => {
        const { shopifyCartId, discountCodes } = get();
        if (!shopifyCartId) return false;
        if (discountCodes.includes(code)) return true;
        const next = Array.from(new Set([...discountCodes, code]));
        try {
          const r = await shopifyCartDiscountCodesUpdate(shopifyCartId, next);
          if (r.cartNotFound) {
            get().clearCart();
            return false;
          }
          if (!r.success) return false;
          set({ discountCodes: r.applicable });
          return r.applicable.includes(code);
        } catch (err) {
          console.error("[cart] applyDiscountCode failed:", err);
          return false;
        }
      },

      clearDiscountCodes: async () => {
        const { shopifyCartId, discountCodes } = get();
        if (!shopifyCartId || discountCodes.length === 0) {
          set({ discountCodes: [] });
          return;
        }
        try {
          await shopifyCartDiscountCodesUpdate(shopifyCartId, []);
        } catch (err) {
          console.error("[cart] clearDiscountCodes failed:", err);
        }
        set({ discountCodes: [] });
      },

      syncCart: async () => {
        const { shopifyCartId, isSyncing } = get();
        if (!shopifyCartId || isSyncing) return;
        set({ isSyncing: true });
        try {
          const cart = await shopifyCartFetch(shopifyCartId);
          if (!cart || cart.totalQuantity === 0) {
            // Shopify cart was completed or expired — drop merch lines but keep wine.
            const wineOnly = get().items.filter(isWine);
            set({
              items: wineOnly,
              shopifyCartId: null,
              shopifyCheckoutUrl: null,
              discountCodes: [],
            });
          } else {
            // Refresh checkout URL in case Shopify rotated it.
            set({ shopifyCheckoutUrl: cart.checkoutUrl });
          }
        } catch (err) {
          console.error("[cart] syncCart failed:", err);
        } finally {
          set({ isSyncing: false });
        }
      },
    }),
    {
      name: "rdw-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        items: s.items,
        shopifyCartId: s.shopifyCartId,
        shopifyCheckoutUrl: s.shopifyCheckoutUrl,
        discountCodes: s.discountCodes,
      }),
      version: 3,
      // Migrate from v1 (which used cartId/checkoutUrl naming) — drop stale state safely.
      migrate: (persisted: any, _version) => {
        if (!persisted) return persisted;
        return {
          items: persisted.items ?? [],
          shopifyCartId: persisted.shopifyCartId ?? null,
          shopifyCheckoutUrl: persisted.shopifyCheckoutUrl ?? null,
          discountCodes: persisted.discountCodes ?? [],
        };
      },
    },
  ),
);
