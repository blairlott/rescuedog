import { supabase } from "@/integrations/supabase/client";

export type RestructureCategory = "ab_variant" | "layout_swap" | "commerce_flow" | "catalog_ia";
export type RestructureSource = "ui" | "bandit" | "behavior_analyzer" | "lindy" | "manual";

export interface ProposeArgs {
  category: RestructureCategory;
  title: string;
  summary: string;
  target_kind: string;
  target_payload?: Record<string, unknown>;
  rationale?: string;
  risk_level?: "low" | "medium" | "high";
  source?: RestructureSource;
}

export async function proposeRestructure(args: ProposeArgs) {
  const { data, error } = await supabase.rpc("propose_restructure", {
    _category: args.category,
    _title: args.title,
    _summary: args.summary,
    _target_kind: args.target_kind,
    _target_payload: (args.target_payload ?? {}) as any,
    _rationale: args.rationale ?? null,
    _risk_level: args.risk_level ?? "medium",
    _source: args.source ?? "ui",
  });
  if (error) throw error;
  return data as string;
}