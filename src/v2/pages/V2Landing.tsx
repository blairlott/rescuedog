import { Link } from "react-router-dom";

export default function V2Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8 max-w-2xl mx-auto">
      <div className="border border-foreground/20 p-2 inline-block text-xs uppercase tracking-wider mb-6">
        v2 · internal test build
      </div>
      <h1 className="text-3xl font-bold mb-3">Unified checkout sandbox</h1>
      <p className="text-muted-foreground mb-6">
        Test environment for the Shopify-payments + Vinoshipper-fulfillment flow.
        Nothing here affects the live store. Use only test SKUs and ship to your
        own address until cutover.
      </p>
      <ul className="space-y-2 text-sm">
        <li>
          <Link to="/v2/shop" className="underline">/v2/shop</Link> — unified catalog (wine + merch)
        </li>
        <li>
          <Link to="/v2/cart" className="underline">/v2/cart</Link> — unified cart
        </li>
        <li>
          <Link to="/v2/checkout/verify" className="underline">/v2/checkout/verify</Link> — DOB + address + VS compliance
        </li>
      </ul>
      <p className="mt-8 text-xs text-muted-foreground">
        Plan: <code>mem://plans/v2-unified-checkout.md</code>
      </p>
    </div>
  );
}