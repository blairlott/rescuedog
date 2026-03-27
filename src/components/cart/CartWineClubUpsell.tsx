import { Link } from "react-router-dom";
import { Wine, ArrowRight } from "lucide-react";

export function CartWineClubUpsell() {
  return (
    <div className="rounded border border-primary/20 bg-primary/5 px-3 py-3 flex items-center gap-3">
      <Wine className="w-5 h-5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">Want bigger savings?</p>
        <p className="text-[11px] text-muted-foreground">Wine Club members save up to 20% on every order.</p>
      </div>
      <Link
        to="/wine-club"
        className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        Join <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
