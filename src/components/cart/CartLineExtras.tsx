import { Award, AlertCircle } from "lucide-react";
import type { CartItem } from "@/lib/shopify";

interface Props {
  item: CartItem;
}

/** Extracts a sommelier-style score from product tags (e.g. "92pts", "95 pts"). */
function extractScore(tags: string[]): number | null {
  for (const t of tags ?? []) {
    const m = t.match(/(\d{2,3})\s*pts?/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 80 && n <= 100) return n;
    }
  }
  return null;
}

function isLowStock(tags: string[]): boolean {
  return (tags ?? []).some((t) => /^(low[-_ ]?stock|limited|last[-_ ]?call|nearly[-_ ]?out)$/i.test(t));
}

export function CartLineExtras({ item }: Props) {
  const tags = item.product?.node?.tags ?? [];
  const score = extractScore(tags);
  const lowStock = isLowStock(tags);

  if (!score && !lowStock) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
      {score && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-brand bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm">
          <Award className="w-2.5 h-2.5" /> {score} pts
        </span>
      )}
      {lowStock && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-brand bg-orange-500/10 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded-sm">
          <AlertCircle className="w-2.5 h-2.5" /> Only a few left
        </span>
      )}
    </div>
  );
}
