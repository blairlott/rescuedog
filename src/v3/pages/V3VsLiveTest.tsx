import { useEffect } from "react";
import { VS_ACCOUNT_ID, VS_INJECTOR_SRC } from "@/lib/vinoshipperConfig";

/**
 * Live Vinoshipper Injector test page for the first non-wine (Printful)
 * product: RDW Stemless Wine Glass — VS product 191646.
 *
 * Place a real order via the Injector cart, then cancel + refund in the
 * Vinoshipper producer dashboard. This proves the full loop:
 *   VS captures payment → ORDER.APPROVED webhook → vs-dropship-bridge
 *   → printful-dispatch → Printful makes & ships → printful-webhook
 *   relays tracking back into VS.
 */
export default function V3VsLiveTest() {
  useEffect(() => {
    if (document.querySelector(`script[src="${VS_INJECTOR_SRC}"]`)) return;
    const s = document.createElement("script");
    s.src = VS_INJECTOR_SRC;
    s.async = true;
    document.body.appendChild(s);

    const onLoaded = () => {
      // @ts-expect-error injector global
      window.Vinoshipper?.init(VS_ACCOUNT_ID, {});
    };
    document.addEventListener("vinoshipper:loaded", onLoaded, false);
    return () => document.removeEventListener("vinoshipper:loaded", onLoaded);
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">VS Live Test — Stemless Wine Glass</h1>
        <p className="text-sm text-muted-foreground">
          Real Vinoshipper checkout. VS product <strong>191646</strong> ($24.00)
          → Printful sync_variant <strong>5314752389</strong>. Place the order,
          then cancel + refund in the VS producer dashboard once the Printful
          dispatch is confirmed.
        </p>
      </header>

      <div className="border p-6 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Product</div>
          <div className="font-medium">RDW Stemless Wine Glass</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Price</div>
          <div className="font-medium">$24.00</div>
        </div>

        {/* Vinoshipper Injector renders the Add to Cart button here */}
        <div className="vs-add-to-cart" data-vs-product-id="191646" />
      </div>

      <ol className="text-sm space-y-2 list-decimal pl-5">
        <li>Click <em>Add to Cart</em>, complete checkout in the VS-hosted drawer.</li>
        <li>Watch <code>/v3/admin/printful-sim/mappings</code> step log for the dispatch.</li>
        <li>Confirm a Printful order appears in the Printful dashboard.</li>
        <li>Cancel + refund the VS order in the producer dashboard.</li>
      </ol>
    </div>
  );
}