import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * v3 cart. Separate localStorage key so it never collides with the
 * production wine cart or the /v2 unified-Shopify cart.
 *
 * All line items resolve to a Vinoshipper product (wine OR non-wine).
 * `fulfillmentMode` is informational only — the actual routing happens
 * server-side in `vs-dropship-bridge` after VS captures payment.
 */
export type V3FulfillmentMode =
  | "vinoshipper_warehouse"
  | "printify"
  | "printful"
  | "gooten"
  | "partner_direct";

export interface V3CartLine {
  vsProductId: string;
  sku: string;
  title: string;
  imageUrl?: string;
  qty: number;
  unitPriceCents: number;
  isWine: boolean;
  fulfillmentMode: V3FulfillmentMode;
  dropshipPartnerId?: string;
}

interface V3CartState {
  lines: V3CartLine[];
  add: (line: V3CartLine) => void;
  remove: (vsProductId: string) => void;
  setQty: (vsProductId: string, qty: number) => void;
  clear: () => void;
}

export const useCartStoreV3 = create<V3CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line) =>
        set((s) => {
          const existing = s.lines.find((l) => l.vsProductId === line.vsProductId);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.vsProductId === line.vsProductId
                  ? { ...l, qty: l.qty + line.qty }
                  : l,
              ),
            };
          }
          return { lines: [...s.lines, line] };
        }),
      remove: (id) =>
        set((s) => ({ lines: s.lines.filter((l) => l.vsProductId !== id) })),
      setQty: (id, qty) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.vsProductId === id ? { ...l, qty: Math.max(0, qty) } : l,
          ),
        })),
      clear: () => set({ lines: [] }),
    }),
    { name: "rdw-cart-v3" },
  ),
);