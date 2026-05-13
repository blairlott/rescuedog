import { ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Merch product images are now managed in Shopify (rescuedoggear).
 * This panel is intentionally minimal and just deep-links to the admin.
 */
export function MerchImagesPanel() {
  const adminUrl = "https://admin.shopify.com/store/rescuedoggear/products";
  return (
    <div className="space-y-6">
      <div className="border border-border bg-secondary p-6">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="font-display text-lg font-bold text-foreground">
              Merch images are now managed in Shopify
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The merch catalog now syncs live from your Shopify store
              (gear.rescuedog.com). Edit product images, titles, descriptions,
              and inventory in the Shopify admin — changes appear on the site
              within a minute.
            </p>
          </div>
        </div>
        <div className="mt-4 ml-8">
          <Button
            asChild
            className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-xs font-bold"
          >
            <a href={adminUrl} target="_blank" rel="noopener noreferrer">
              Open Shopify Admin <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1.5 px-1">
        <p><strong>Tip:</strong> Use 1200×1200 or larger square images for the cleanest grid look on /merch.</p>
        <p>
          Wine catalog is unchanged — wines continue to come from Vinoshipper
          and the Lovable database.
        </p>
      </div>
    </div>
  );
}

export default MerchImagesPanel;
