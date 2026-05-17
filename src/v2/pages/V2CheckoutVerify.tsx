import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Pre-checkout interstitial.
 * Captures DOB + ship-to address, calls `vs-compliance-check` edge function,
 * and (eventually) writes a compliance token + tax line item to the Shopify
 * cart before redirecting to `checkoutUrl`.
 */
export default function V2CheckoutVerify() {
  const [dob, setDob] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("vs-compliance-check", {
      body: { dob, shipToState: state, shipToZip: zip, products: [] },
    });
    setResult(error ?? data);
    setLoading(false);
  };

  return (
    <div className="min-h-screen p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Verify before checkout</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Date of birth
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            required
            className="block w-full border border-foreground/30 p-2 mt-1"
          />
        </label>
        <label className="block text-sm">
          Ship-to state (2-letter)
          <input
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
            required
            className="block w-full border border-foreground/30 p-2 mt-1"
          />
        </label>
        <label className="block text-sm">
          ZIP
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value.slice(0, 10))}
            required
            className="block w-full border border-foreground/30 p-2 mt-1"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="bg-foreground text-background px-4 py-2 text-sm"
        >
          {loading ? "Checking…" : "Check compliance"}
        </button>
      </form>
      {result != null && (
        <pre className="mt-6 text-xs bg-muted p-3 overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}