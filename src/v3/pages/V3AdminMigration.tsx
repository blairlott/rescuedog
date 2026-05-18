export default function V3AdminMigration() {
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-3">
      <h1 className="text-2xl font-bold">Shopify → Vinoshipper Migration (dry run)</h1>
      <p className="text-sm text-muted-foreground">
        Lists every active Shopify merch product alongside the existing
        <code> dropship_skus </code> row (if any) and shows whether a VS
        non-wine product needs to be created. Read-only until the operator
        clicks "Provision in VS".
      </p>
      <p className="text-xs text-muted-foreground">
        Wired by the <code>shopify-to-vs-merch-migrate</code> edge function
        (scaffolded, dry-run mode).
      </p>
    </main>
  );
}