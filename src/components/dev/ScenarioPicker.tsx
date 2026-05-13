import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, X, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/stores/cartStore";
import type { CartItem, ShopifyProduct } from "@/lib/shopify";

/**
 * Dev/QA scenario picker — floating button that auto-runs scripted journeys
 * through the simulated checkout so we can evaluate the full UX end-to-end
 * without manually clicking through each path.
 *
 * Hidden in production builds.
 */

type ScenarioId =
  | "wine_fail_merch_buys"
  | "merch_oos"
  | "split_cart";

interface Scenario {
  id: ScenarioId;
  label: string;
  blurb: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "wine_fail_merch_buys",
    label: "Wine compliance fail → merch still buys",
    blurb:
      "Customer in a non-shipping state (TX) — wine is blocked, but merch checkout completes.",
  },
  {
    id: "merch_oos",
    label: "Out-of-stock merch line",
    blurb:
      "Two merch items added; one is OOS and gets dropped before checkout.",
  },
  {
    id: "split_cart",
    label: "Split cart (wine + merch)",
    blurb:
      "Both wine and merch in cart — runs merch checkout, then wine checkout, then thank-you.",
  },
];

function makeProduct(opts: {
  kind: "wine" | "merch";
  handle: string;
  title: string;
  price: number;
  image?: string;
}): ShopifyProduct {
  const variantId = `${opts.kind}-variant:${opts.handle}`;
  return {
    node: {
      id: `${opts.kind}:${opts.handle}`,
      title: opts.title,
      description: "",
      handle: opts.handle,
      tags: [],
      priceRange: {
        minVariantPrice: { amount: opts.price.toFixed(2), currencyCode: "USD" },
      },
      images: {
        edges: [
          {
            node: {
              url:
                opts.image ??
                "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400",
              altText: opts.title,
            },
          },
        ],
      },
      variants: {
        edges: [
          {
            node: {
              id: variantId,
              title: "Default",
              price: { amount: opts.price.toFixed(2), currencyCode: "USD" },
              availableForSale: true,
              selectedOptions: [{ name: "Title", value: "Default" }],
            },
          },
        ],
      },
      options: [{ name: "Title", values: ["Default"] }],
      productKind: opts.kind,
    },
  };
}

function makeLine(p: ShopifyProduct, qty: number): CartItem {
  const variantId = p.node.variants.edges[0].node.id;
  return {
    lineId: variantId,
    product: p,
    variantId,
    variantTitle: "Default",
    price: p.node.priceRange.minVariantPrice,
    quantity: qty,
    selectedOptions: [{ name: "Title", value: "Default" }],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ScenarioPicker() {
  // Hide in production builds — purely a dev/QA tool.
  if (import.meta.env.PROD) return null;

  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<ScenarioId | null>(null);
  const navigate = useNavigate();

  const setItems = (items: CartItem[]) => {
    // Bypass async addItem (which mirrors to live Shopify cart) — for sim
    // we drop items directly into the local store.
    useCartStore.setState({
      items,
      shopifyCartId: null,
      shopifyCheckoutUrl: null,
    });
  };

  const completeCheckout = async (kind: "wine" | "merch", items: CartItem[]) => {
    const total = items.reduce(
      (s, i) => s + parseFloat(i.price.amount) * i.quantity,
      0,
    );
    const bottles = items
      .filter((i) => i.product.node.productKind === "wine")
      .reduce((s, i) => s + i.quantity, 0);
    const units = items
      .filter((i) => i.product.node.productKind !== "wine")
      .reduce((s, i) => s + i.quantity, 0);
    const orderId = `${kind === "wine" ? "SIM" : "MERCH-SIM"}-${Date.now()}`;
    navigate(
      `/thank-you?order=${encodeURIComponent(orderId)}&total=${total.toFixed(2)}&bottles=${bottles}&units=${units}`,
    );
  };

  const runScenario = async (id: ScenarioId) => {
    setRunning(id);
    setOpen(false);
    try {
      // Reset cart first.
      useCartStore.getState().clearCart();
      await sleep(150);

      if (id === "wine_fail_merch_buys") {
        toast.info("Scenario: customer in TX (non-shipping)", {
          description: "Wine blocked by compliance — proceeding with merch only.",
        });
        await sleep(800);
        const tee = makeProduct({
          kind: "merch",
          handle: "rescue-tee",
          title: "Rescue Dog Tee",
          price: 32,
        });
        const items = [makeLine(tee, 2)];
        setItems(items);
        toast.success("Merch added", { description: "2× Rescue Dog Tee — $64.00" });
        await sleep(900);
        toast.message("Walking through merch checkout…", {
          description: "Sam Rescue · 4242…4242 · simulated.",
        });
        await sleep(1200);
        useCartStore.getState().clearCart();
        await completeCheckout("merch", items);
      }

      if (id === "merch_oos") {
        const hat = makeProduct({
          kind: "merch",
          handle: "trail-hat",
          title: "Trail Hat (LIMITED)",
          price: 28,
        });
        const hoodie = makeProduct({
          kind: "merch",
          handle: "rescue-hoodie",
          title: "Rescue Hoodie",
          price: 58,
        });
        const items = [makeLine(hat, 1), makeLine(hoodie, 1)];
        setItems(items);
        toast.info("Cart populated", { description: "Trail Hat + Rescue Hoodie" });
        await sleep(1100);
        toast.error("Trail Hat is out of stock", {
          description: "Removed from your cart automatically.",
        });
        const remaining = [makeLine(hoodie, 1)];
        setItems(remaining);
        await sleep(1200);
        toast.message("Completing checkout…");
        await sleep(900);
        useCartStore.getState().clearCart();
        await completeCheckout("merch", remaining);
      }

      if (id === "split_cart") {
        const wine = makeProduct({
          kind: "wine",
          handle: "rescue-red-2022",
          title: "Rescue Red 2022",
          price: 28,
        });
        const tote = makeProduct({
          kind: "merch",
          handle: "canvas-tote",
          title: "Canvas Tote",
          price: 22,
        });
        const wineLines = [makeLine(wine, 6)];
        const merchLines = [makeLine(tote, 1)];
        setItems([...wineLines, ...merchLines]);
        toast.info("Split cart loaded", {
          description: "6 bottles of wine + 1 merch item.",
        });
        await sleep(1000);
        toast.message("Step 1: merch checkout (Shopify-side)…");
        await sleep(1100);
        // Drop merch, keep wine.
        setItems(wineLines);
        toast.success("Merch order placed (simulated)");
        await sleep(900);
        toast.message("Step 2: wine checkout (Vinoshipper-side)…");
        await sleep(1200);
        useCartStore.getState().clearCart();
        await completeCheckout("wine", wineLines);
      }
    } finally {
      setRunning(null);
    }
  };

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 left-4 z-[80] bg-foreground text-background hover:bg-foreground/90 px-3 py-2 text-[11px] uppercase tracking-brand font-bold flex items-center gap-1.5 shadow-lg border border-foreground/20"
        aria-label="Open scenario picker"
      >
        <FlaskConical className="h-3.5 w-3.5" />
        QA Scenarios
      </button>

      {open && (
        <div className="fixed bottom-16 left-4 z-[81] w-[300px] bg-background border border-border shadow-xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
            <span className="text-[11px] uppercase tracking-brand font-bold">
              Test Scenarios
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="divide-y divide-border">
            {SCENARIOS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => runScenario(s.id)}
                  disabled={running !== null}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    {running === s.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 text-primary" />
                    )}
                    {s.label}
                  </div>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">
                    {s.blurb}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
            Each scenario auto-runs through to the thank-you screen.
          </div>
        </div>
      )}
    </>
  );
}
