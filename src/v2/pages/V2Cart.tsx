import { useCartStoreV2 } from "@/v2/stores/cartStoreV2";
import { Link } from "react-router-dom";

export default function V2Cart() {
  const items = useCartStoreV2((s) => s.items);
  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">v2 cart (stub)</h1>
      {items.length === 0 ? (
        <p className="text-muted-foreground">Cart is empty.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.variantId} className="border p-3">
              {i.title} × {i.quantity} · {i.fulfillmentChannel}
            </li>
          ))}
        </ul>
      )}
      <Link to="/v2/checkout/verify" className="inline-block mt-6 underline">
        Continue to compliance check →
      </Link>
    </div>
  );
}