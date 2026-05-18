export default function V3Merch() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold mb-2">Merch (v3)</h1>
      <p className="text-muted-foreground text-sm">
        Non-wine SKUs only — sourced from existing <code>dropship_skus</code> rows
        whose <code>vinoshipper_product_id</code> has been provisioned.
      </p>
    </main>
  );
}