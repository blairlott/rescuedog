import { useEffect, useRef } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useIsMember } from "@/hooks/useIsMember";

/**
 * Pushes a `page_view` event to window.dataLayer on every SPA route change.
 * GTM (container GTM-NHTH66HM) fans this out to GA4 / Meta CAPI / TikTok /
 * Pinterest. Schema is locked — reuse it for any future custom events:
 *
 *   {
 *     event: "page_view",
 *     page_type: "home" | "shop" | "product" | "club" | "mission" | ...,
 *     wine_sku?: string,          // product pages only
 *     user_status: "member" | "non_member" | "unknown",
 *   }
 */
function classifyPath(pathname: string): { page_type: string; wine_sku?: string } {
  const p = pathname.toLowerCase();
  if (p === "/" || p === "/index") return { page_type: "home" };
  if (p === "/merch" || p.startsWith("/merch/")) return { page_type: "merch_home" };
  if (p.startsWith("/product/") || p.startsWith("/shop-wine/")) {
    const slug = p.split("/")[2] ?? "";
    return { page_type: "product", wine_sku: slug };
  }
  if (p === "/wines" || p === "/shop" || p === "/shop-wine" || p.startsWith("/wines/")) return { page_type: "shop" };
  if (p === "/club" || p.startsWith("/club/")) return { page_type: "club" };
  if (p === "/mission" || p === "/wine-that-gives-back") return { page_type: "mission" };
  if (p === "/about" || p === "/vineyard") return { page_type: "about" };
  if (p === "/cart" || p === "/checkout") return { page_type: "checkout" };
  if (p === "/thank-you") return { page_type: "thank_you" };
  if (p.startsWith("/blog")) return { page_type: "blog" };
  if (p.startsWith("/pairings")) return { page_type: "pairings" };
  if (p === "/contact") return { page_type: "contact" };
  if (p === "/store-locator" || p === "/where-to-buy") return { page_type: "store_locator" };
  if (p === "/wholesale" || p === "/trade-and-media") return { page_type: "wholesale" };
  if (p === "/press") return { page_type: "press" };
  if (p === "/subscribe") return { page_type: "subscribe" };
  if (p === "/donation") return { page_type: "donation" };
  if (p.startsWith("/ambassador")) return { page_type: "ambassador" };
  if (p === "/events" || p.startsWith("/events/")) return { page_type: "events" };
  if (p === "/account" || p.startsWith("/account/")) return { page_type: "account" };
  if (p.startsWith("/cms") || p.startsWith("/crm") || p.startsWith("/kennel") || p.startsWith("/admin") || p.startsWith("/finance") || p.startsWith("/dropship")) {
    return { page_type: "internal" };
  }
  return { page_type: "other" };
}

export function PageViewTracker() {
  const location = useLocation();
  const params = useParams();
  const { user, loading: authLoading } = useCustomerAuth();
  const { isMember, isLoading: memberLoading } = useIsMember();
  const lastPushedRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Wait until auth + membership are resolved so user_status is correct.
    if (authLoading || memberLoading) return;

    const { page_type, wine_sku } = classifyPath(location.pathname);
    const handle = (params as { handle?: string }).handle;
    const sku = wine_sku || handle;

    const user_status: "member" | "non_member" | "unknown" =
      !user ? "unknown" : isMember ? "member" : "non_member";

    // Dedupe rapid re-renders that don't actually change the route.
    const key = `${location.pathname}|${user_status}`;
    if (lastPushedRef.current === key) return;
    lastPushedRef.current = key;

    try {
      const w = window as unknown as { dataLayer?: Array<Record<string, unknown>> };
      w.dataLayer = w.dataLayer || [];
      const payload: Record<string, unknown> = {
        event: "page_view",
        page_type,
        user_status,
        page_path: location.pathname,
      };
      if (page_type === "product" && sku) payload.wine_sku = sku;
      w.dataLayer.push(payload);
    } catch {
      /* never break the app on analytics */
    }
  }, [location.pathname, params, user, authLoading, isMember, memberLoading]);

  return null;
}