/**
 * Thin wrapper around the Vinoshipper Injector global.
 *
 * The injector script lives in index.html and exposes `window.Vinoshipper`
 * after it fires the `vinoshipper:loaded` event. We use:
 *   - onProductAdd(productId, qty) → Promise — pushes a line into VS's cart
 *   - cartOpen() — opens their slide-out cart (already themed on our domain)
 *
 * Source: https://developer.vinoshipper.com/docs/injector-methods
 */
type VsInjector = {
  initCartData?: (cartId?: string | null) => Promise<unknown>;
  onProductAdd: (productId: number, qty?: number) => Promise<unknown>;
  cartOpen: () => void;
  getCart?: () => { id?: string; cartId?: string; uuid?: string } | null;
  getCartCheckout?: () => URL;
  getLinkParams?: (url: URL) => Promise<URL>;
};

const getVs = (): VsInjector | null => {
  try {
    const w = window as unknown as { Vinoshipper?: VsInjector };
    return w.Vinoshipper ?? null;
  } catch {
    return null;
  }
};

/** Resolve once the injector global is available (poll up to ~5s). */
export async function waitForVinoshipper(timeoutMs = 5000): Promise<VsInjector | null> {
  const existing = getVs();
  if (existing) return existing;
  return new Promise((resolve) => {
    const start = Date.now();
    const iv = window.setInterval(() => {
      const vs = getVs();
      if (vs) {
        window.clearInterval(iv);
        resolve(vs);
      } else if (Date.now() - start > timeoutMs) {
        window.clearInterval(iv);
        resolve(null);
      }
    }, 100);
  });
}

export interface VsCartLine {
  productId: number;
  quantity: number;
}

/**
 * Apply a coupon code to a Vinoshipper cart via the public REST API.
 *
 * Vinoshipper's Injector exposes no client-side `applyCode()` method
 * (see https://developer.vinoshipper.com/docs/injector-methods), and the
 * hosted checkout URL does not read a `promo_code` query param — only
 * `meta_*` keys passed via `cartUrlParams` are honored, and those are
 * pure metadata, not discounts.
 *
 * The only documented programmatic way to apply a discount before handoff
 * is POST /api/v3/cart/{cartId}/coupon
 * (https://developer.vinoshipper.com/reference/addcoupon).
 *
 * Failures (invalid code, ineligible cart, network error, CORS) are
 * swallowed so they never block the customer from reaching checkout —
 * the worst case is the code simply isn't applied and the customer can
 * re-enter it manually on the Vinoshipper page.
 */
export async function applyVinoshipperCoupon(
  cartId: string,
  code: string,
): Promise<boolean> {
  if (!cartId || !code) return false;
  try {
    const res = await fetch(
      `https://vinoshipper.com/api/v3/cart/${encodeURIComponent(cartId)}/coupon`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ code }),
      },
    );
    if (!res.ok) {
      console.warn("[vinoshipper] coupon apply failed", res.status, code);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[vinoshipper] coupon apply error", e);
    return false;
  }
}

/**
 * Push every line into the Vinoshipper cart sequentially, then open it.
 * Throws if the injector never loaded or any add fails.
 */
export async function addLinesAndOpenCart(lines: VsCartLine[]): Promise<void> {
  const vs = await waitForVinoshipper();
  if (!vs) throw new Error("Vinoshipper Injector did not load");
  for (const line of lines) {
    if (!Number.isFinite(line.productId) || line.quantity <= 0) continue;
    // Sequential — VS does not document concurrency safety on onProductAdd.
    await vs.onProductAdd(line.productId, line.quantity);
  }
  vs.cartOpen();
}

/**
 * Push all lines into the Vinoshipper cart, then redirect the browser to
 * Vinoshipper's hosted cart page (cartId + ret URL). This is the "one click
 * to checkout" flow — skips the slide-out drawer entirely.
 */
export async function addLinesAndGoToHostedCart(
  lines: VsCartLine[],
  /**
   * Optional pre-opened popup window. Callers in the dual checkout flow
   * must open both popups (Shopify + Vinoshipper) synchronously inside
   * the same user gesture, then hand the VS popup here so we can keep
   * doing the async injector work without losing the popup permission.
   * If omitted, we open a new tab ourselves.
   */
  preOpenedPopup?: Window | null,
  /**
   * Optional promo/discount code to apply to the cart before handoff.
   * Applied via the documented coupon REST endpoint after lines are
   * added but before the redirect.
   */
  promoCode?: string | null,
): Promise<void> {
  const popup = preOpenedPopup ?? (typeof window !== "undefined" ? window.open("about:blank", "_blank") : null);
  const vs = await waitForVinoshipper(10000);
  if (!vs) {
    try { popup?.close(); } catch {}
    throw new Error("Vinoshipper Injector did not load");
  }
  if (!vs.getCart?.()?.cartId) {
    await vs.initCartData?.(null);
  }
  for (const line of lines) {
    if (!Number.isFinite(line.productId) || line.quantity <= 0) continue;
    await vs.onProductAdd(line.productId, line.quantity);
  }
  // Pull the server-side cart id the injector just created.
  const checkoutUrl = vs.getCartCheckout?.() ?? new URL("/cart", "https://vinoshipper.com");
  const cart = vs.getCart?.() ?? null;
  const cartId = cart && (cart.cartId || cart.id || cart.uuid);
  if (cartId && !checkoutUrl.searchParams.has("cartId")) {
    checkoutUrl.searchParams.set("cartId", cartId);
  }
  // Apply any promo/discount code via the documented REST endpoint.
  // We do this after products are added (so cart subtotal/qty rules can
  // evaluate) and before the redirect (so totals are correct on the
  // hosted page). Non-blocking — failures fall through.
  if (promoCode && cartId) {
    await applyVinoshipperCoupon(String(cartId), promoCode);
  }
  checkoutUrl.searchParams.set("ret", window.location.href);
  const finalUrl = vs.getLinkParams ? await vs.getLinkParams(checkoutUrl) : checkoutUrl;
  const href = finalUrl.toString();
  if (popup && !popup.closed) {
    try {
      popup.location.href = href;
      popup.focus?.();
      return;
    } catch {
      // Cross-origin assign failed — fall through to same-tab redirect.
    }
  }
  // Popup blocked or unavailable — preserve old behavior so checkout still works.
  window.location.href = href;
}
