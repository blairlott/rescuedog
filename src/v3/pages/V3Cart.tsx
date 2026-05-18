import { useCartStoreV3 } from "../stores/cartStoreV3";

export default function V3Cart() {
  const lines = useCartStoreV3((s) => s.lines);
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold mb-4">Cart (v3 preview)</h1>
      {lines.length === 0 ? (
        <p className="text-muted-foreground text-sm">Empty. Add items from /v3/shop.</p>
      ) : (
        <ul className="divide-y border">
          {lines.map((l) => (
            <li key={l.vsProductId} className="p-3 flex justify-between text-sm">
              <span>{l.title} × {l.qty}</span>
              <span className="text-muted-foreground">{l.fulfillmentMode}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Real checkout will be handed to the VS Injector cart drawer (PCI + age
        verify on their side).
      </p>
    </main>
  );
}