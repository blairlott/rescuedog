/**
 * Thin GA4 / GTM dataLayer wrapper. The GTM container (GTM-NHTH66HM) is
 * loaded in index.html and fans events out to GA4, Meta Pixel, TikTok,
 * Pinterest. Server-side conversions for Vinoshipper purchases land via
 * the vinoshipper-webhook edge function.
 *
 * All events follow GA4 ecommerce schema so a single GTM tag works for both
 * the wine site and /merch.
 */
type DLItem = {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: "wine" | "merch" | string;
  item_variant?: string;
  price?: number;
  quantity?: number;
};

function push(event: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as { dataLayer?: Array<Record<string, unknown>> };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event, ecommerce: null }); // clear previous ecom obj
    w.dataLayer.push({ event, ...payload });
  } catch {
    // never let analytics break the app
  }
}

export const analytics = {
  viewItem(item: DLItem) {
    push("view_item", { ecommerce: { currency: "USD", value: item.price ?? 0, items: [item] } });
  },
  addToCart(item: DLItem) {
    push("add_to_cart", {
      ecommerce: { currency: "USD", value: (item.price ?? 0) * (item.quantity ?? 1), items: [item] },
    });
  },
  removeFromCart(item: DLItem) {
    push("remove_from_cart", {
      ecommerce: { currency: "USD", value: (item.price ?? 0) * (item.quantity ?? 1), items: [item] },
    });
  },
  beginCheckout(items: DLItem[], value: number, channel: "vinoshipper" | "shopify" | "unified") {
    push("begin_checkout", { ecommerce: { currency: "USD", value, items }, checkout_channel: channel });
  },
  custom(event: string, data: Record<string, unknown> = {}) {
    push(event, data);
  },
};

export type { DLItem };