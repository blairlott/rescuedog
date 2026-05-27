import { useEffect, useRef } from "react";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { supabase } from "@/integrations/supabase/client";
import { getGclid } from "@/lib/metaAttribution";

/**
 * Snapshots the cart to Supabase for the abandoned-cart recovery worker.
 * Debounces by 8s so rapid changes don't spam the edge function.
 * Clears the snapshot whenever the cart empties or the user signs out.
 */
export function useAbandonedCartSnapshot() {
  const { user } = useCustomerAuth();
  const items = useCartStore((s) => s.items);
  const shopifyCartId = useCartStore((s) => s.shopifyCartId);
  const shopifyCheckoutUrl = useCartStore((s) => s.shopifyCheckoutUrl);
  const timerRef = useRef<number | null>(null);
  const lastFingerprint = useRef<string>("");

  useEffect(() => {
    if (!user?.email) return;
    const itemCount = items.reduce((n, i) => n + (i.quantity ?? 0), 0);
    const subtotalCents = Math.round(
      items.reduce((n, i) => n + Number(i.price?.amount ?? 0) * (i.quantity ?? 0), 0) * 100,
    );
    const fingerprint = JSON.stringify({
      itemCount,
      subtotalCents,
      ids: items.map((i) => `${i.variantId}:${i.quantity}`).sort(),
      shopifyCartId,
    });
    if (fingerprint === lastFingerprint.current) return;
    lastFingerprint.current = fingerprint;

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const compact = items.slice(0, 50).map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        product: {
          node: {
            title: i.product?.node?.title ?? "",
            productKind: i.product?.node?.productKind ?? null,
          },
        },
        variantTitle: i.variantTitle ?? null,
        price: i.price ?? null,
      }));
      const getCookie = (name: string): string | null => {
        if (typeof document === "undefined") return null;
        const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]+)"));
        return m ? decodeURIComponent(m[2]) : null;
      };
      void supabase.functions
        .invoke("cart-snapshot", {
          body: {
            action: itemCount > 0 ? "upsert" : "clear",
            email: user.email,
            items: compact,
            item_count: itemCount,
            subtotal_cents: subtotalCents,
            shopify_cart_id: shopifyCartId,
            shopify_checkout_url: shopifyCheckoutUrl,
            fbc: getCookie("_fbc"),
            fbp: getCookie("_fbp"),
            // Unwrapped click ID, not the GCL.{seconds}.{gclid} wrapper.
            gclid: getGclid(),
          },
        })
        .catch((e) => console.warn("[abandoned-cart] snapshot failed", e));
    }, 8000);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [user?.email, items, shopifyCartId, shopifyCheckoutUrl]);
}