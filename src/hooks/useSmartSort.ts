import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShopifyProduct } from "@/lib/shopify";
import { useSlotScores } from "./useSlotScores";
import { useExperiment } from "./useExperiment";

const ensured = new Set<string>();

/**
 * Smart Sort. Re-orders a product list using each SKU's smoothed bandit score
 * for the visitor's segment. Curated callers pass `mode="curated"` to get the
 * original order back unchanged.
 *
 * Side-effects:
 *  - Idempotently spins up a `candidate-pool` experiment for `slotKey` whose
 *    variants are the supplied product handles, so the bandit can attribute
 *    revenue back to ranks.
 *  - Records a single exposure per session when Smart Sort is the active mode.
 */
export function useSmartSort(
  slotKey: string,
  products: ShopifyProduct[],
  mode: "curated" | "smart",
): { products: ShopifyProduct[]; ready: boolean } {
  const { scores, ready } = useSlotScores(mode === "smart" ? slotKey : null);

  // Ensure the candidate experiment exists so scores have variants to land on.
  // Keyed by slot + pool fingerprint so a catalog change re-seeds variants.
  const poolSig = useMemo(
    () => products.map((p) => p.node.handle).sort().join(","),
    [products],
  );

  useEffect(() => {
    if (mode !== "smart" || !products.length) return;
    const key = `${slotKey}::${poolSig}`;
    if (ensured.has(key)) return;
    ensured.add(key);
    supabase.rpc("ensure_candidate_experiment", {
      _slot_key: slotKey,
      _name: `Smart Sort: ${slotKey}`,
      _candidates: products.map((p) => ({
        ref: p.node.handle,
        type: "product",
        weight: 1,
        metadata: { title: p.node.title },
      })) as never,
      _primary_metric: "revenue_per_visitor" as never,
      _exploration_floor: 200,
    });
  }, [slotKey, mode, poolSig, products]);

  // Light-touch impression so the bandit knows Smart Sort was the surface.
  const exp = useExperiment<{ rank_mode?: string }>(`${slotKey}_mode`, { rank_mode: mode });
  useEffect(() => {
    if (mode === "smart") exp.recordConversion("smart_view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const sorted = useMemo(() => {
    if (mode !== "smart" || !ready) return products;
    return [...products].sort((a, b) => {
      const sa = scores.get(a.node.handle)?.score ?? 0;
      const sb = scores.get(b.node.handle)?.score ?? 0;
      return sb - sa;
    });
  }, [products, mode, ready, scores]);

  return { products: sorted, ready };
}