export default function V3Landing() {
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Sandbox · /v3
      </p>
      <h1 className="text-3xl font-bold">Vinoshipper Unified Cart + Dropship Bridge</h1>
      <p className="text-muted-foreground">
        Single VS checkout for wine and merch. Non-wine line items fork
        server-side to the appropriate dropship partner (Printify, Printful,
        partner_direct) after VS captures payment. Production routes are
        untouched.
      </p>
      <ul className="list-disc pl-6 text-sm space-y-1">
        <li><a className="underline" href="/v3/shop">/v3/shop</a> — unified catalog</li>
        <li><a className="underline" href="/v3/merch">/v3/merch</a> — non-wine only</li>
        <li><a className="underline" href="/v3/cart">/v3/cart</a> — cartStoreV3 preview</li>
        <li><a className="underline" href="/v3/admin/migration">/v3/admin/migration</a> — Shopify → VS migration plan</li>
      </ul>
    </main>
  );
}