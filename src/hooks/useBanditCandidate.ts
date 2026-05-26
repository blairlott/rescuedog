import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useExperiment } from "./useExperiment";

export interface CandidateInput {
  /** Stable id: product handle, sku, or strategy key. Used as the variant key. */
  ref: string;
  /** Free-form category — "product" | "merch" | "wine" | "strategy" | ... */
  type?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface BanditPick {
  /** The bandit-chosen candidate ref, or `null` while loading. */
  candidateRef: string | null;
  /** Source — "experiment" once the bandit has assigned, "default" before. */
  source: "experiment" | "personalization" | "default";
  /** Call when the user clicks / engages with the picked candidate. */
  recordClick: (metadata?: Record<string, unknown>) => void;
  /** Call when the user adds to cart from the picked candidate. */
  recordAdd: (metadata?: Record<string, unknown>) => void;
  /** Call with cents when an order attributed to this pick completes. */
  recordRevenue: (cents: number, metadata?: Record<string, unknown>) => void;
}

const ensuredSlots = new Set<string>();
const ensureInflight = new Map<string, Promise<unknown>>();

/**
 * Candidate-pool bandit. Spins up (idempotently) a bandit experiment for `slotKey`
 * whose variants are the supplied candidates, then resolves the visitor's pick via
 * the existing per-segment Thompson sampler.
 *
 * Each candidate.ref becomes the variant key. `defaultRef` is returned until the
 * RPC resolves (or if no experiment exists yet).
 *
 * @example
 *   const pick = useBanditCandidate("cart_upsell_product", candidates, fallbackHandle);
 *   const product = lookupByHandle(pick.candidateRef ?? fallbackHandle);
 */
export function useBanditCandidate(
  slotKey: string,
  candidates: CandidateInput[],
  defaultRef: string | null,
  opts?: { name?: string; primaryMetric?: "revenue_per_visitor" | "conversion_rate"; explorationFloor?: number },
): BanditPick {
  // Stable signature so we only ensure when the pool actually changes
  const poolSig = useMemo(
    () => candidates.map((c) => `${c.ref}:${c.type ?? "product"}:${c.weight ?? 1}`).sort().join("|"),
    [candidates],
  );

  useEffect(() => {
    if (!candidates.length) return;
    const key = `${slotKey}::${poolSig}`;
    if (ensuredSlots.has(key)) return;
    let promise = ensureInflight.get(key);
    if (!promise) {
      promise = supabase.rpc("ensure_candidate_experiment", {
        _slot_key: slotKey,
        _name: opts?.name ?? slotKey,
        _candidates: candidates.map((c) => ({
          ref: c.ref,
          type: c.type ?? "product",
          weight: c.weight ?? 1,
          metadata: c.metadata ?? {},
        })) as never,
        _primary_metric: (opts?.primaryMetric ?? "revenue_per_visitor") as never,
        _exploration_floor: opts?.explorationFloor ?? 150,
      }).then(() => {
        ensuredSlots.add(key);
      });
      ensureInflight.set(key, promise);
      promise.finally(() => ensureInflight.delete(key));
    }
  }, [slotKey, poolSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // The variantKey returned by useExperiment IS the candidate_ref (we use ref as key)
  const assignment = useExperiment<{ candidate_ref?: string }>(slotKey, {
    candidate_ref: defaultRef ?? undefined,
  });

  const candidateRef =
    assignment.config?.candidate_ref ??
    assignment.variantKey ??
    defaultRef;

  return {
    candidateRef: candidateRef ?? null,
    source: assignment.source,
    recordClick: (metadata) => assignment.recordConversion("click", { candidate_ref: candidateRef, ...metadata }),
    recordAdd: (metadata) => assignment.recordConversion("add_to_cart", { candidate_ref: candidateRef, ...metadata }),
    recordRevenue: (cents, metadata) =>
      assignment.recordRevenue(cents, "purchase", { candidate_ref: candidateRef, ...metadata }),
  };
}