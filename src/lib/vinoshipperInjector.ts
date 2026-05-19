/**
 * Thin wrapper around the Vinoshipper Injector global.
 *
 * The injector script lives in index.html and exposes `window.top.Vinoshipper`
 * after it fires the `vinoshipper:loaded` event. We use:
 *   - onProductAdd(productId, qty) → Promise — pushes a line into VS's cart
 *   - cartOpen() — opens their slide-out cart (already themed on our domain)
 *
 * Source: https://developer.vinoshipper.com/docs/injector-methods
 */
type VsInjector = {
  onProductAdd: (productId: number, qty?: number) => Promise<unknown>;
  cartOpen: () => void;
  getCart?: () => unknown;
};

const getVs = (): VsInjector | null => {
  try {
    const w = (window.top ?? window) as unknown as { Vinoshipper?: VsInjector };
    return w?.Vinoshipper ?? null;
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
