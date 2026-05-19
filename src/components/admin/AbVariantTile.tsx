import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FlaskConical } from "lucide-react";
import { AB_META, clearVariant, forceVariant, getVariant, type Variant } from "@/lib/abVariant";

/**
 * Admin QA tile for the WP <-> Lovable A/B test. Lets staff see and force
 * their current bucket without typing `?rdw_force=...` URL params.
 */
export function AbVariantTile() {
  const { toast } = useToast();
  const [variant, setVariant] = useState<Variant>("lovable");

  useEffect(() => {
    setVariant(getVariant());
  }, []);

  const apply = (v: Variant) => {
    forceVariant(v);
    setVariant(v);
    toast({ title: `Bucket set to ${v}`, description: `Cookie ${AB_META.COOKIE_NAME} updated.` });
  };

  const reset = () => {
    clearVariant();
    toast({ title: "Bucket cleared", description: "Next WP visit will re-bucket fresh." });
    setVariant(getVariant());
  };

  const dot = variant === "lovable" ? "bg-primary" : "bg-muted-foreground";

  return (
    <div className="border border-border bg-background p-6">
      <div className="flex items-start gap-3 mb-4">
        <FlaskConical className="h-6 w-6 text-primary shrink-0" />
        <div>
          <h3 className="font-bold text-foreground">A/B QA — {AB_META.AB_TEST_ID}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Current bucket on this device: <span className={`inline-block w-2 h-2 ${dot} mr-1.5 align-middle`} />
            <span className="font-mono">{variant}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={variant === "lovable" ? "default" : "outline"} onClick={() => apply("lovable")}>
          Force Lovable
        </Button>
        <Button size="sm" variant={variant === "legacy" ? "default" : "outline"} onClick={() => apply("legacy")}>
          Force Legacy (WP)
        </Button>
        <Button size="sm" variant="ghost" onClick={reset}>
          Clear cookie
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Cookie: <span className="font-mono">{AB_META.COOKIE_NAME}</span> · 30-day sticky · scoped to this host.
      </p>
    </div>
  );
}