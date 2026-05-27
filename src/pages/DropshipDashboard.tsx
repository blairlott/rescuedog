import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Truck, ExternalLink, Lock } from "lucide-react";
import { Seo } from "@/components/Seo";

export default function DropshipDashboard() {
  const { data: role } = useUserRole();
  const allowed =
    role?.isAdminOrOwner ||
    role?.canViewBackend ||
    (role?.roles as string[] | undefined)?.includes("dropship_manager");

  if (!allowed) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-2">
        <h1 className="text-xl font-bold">Drop-Ship Dashboard</h1>
        <p className="text-sm text-muted-foreground">You need the <code>dropship_manager</code>, <code>admin</code>, or <code>owner</code> role to access this page.</p>
      </div>
    );
  }

  const tabs = [
    "Health & Tracking", "Orders", "Partners", "SKUs",
    "AI Curation", "Marketplace", "Payouts", "Activity",
  ];

  return (
    <>
      <Seo noindex title="Dropship Dashboard" />
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6 flex items-center gap-3">
        <Truck className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-brand uppercase text-muted-foreground">Drop-Ship Dashboard</h1>
          <p className="text-sm text-muted-foreground">Fulfillment partners, SKUs, orders, and payouts.</p>
        </div>
      </header>

      {/* Managed-in-Shopify notice */}
      <div className="border border-border bg-card p-6 mb-6 flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="h-10 w-10 bg-muted flex items-center justify-center shrink-0">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h2 className="font-bold uppercase tracking-brand text-sm">Managed in Shopify</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Dropshippers, fulfillment apps, supplier connections, and inventory routing are now managed
            directly inside Shopify. Use the Shopify admin to add or edit drop-ship partners and apps —
            changes flow into this storefront automatically.
          </p>
        </div>
        <Button asChild>
          <a
            href="https://admin.shopify.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2"
          >
            Open Shopify Admin <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>

      {/* Greyed-out, non-interactive preview of what used to live here */}
      <div className="relative opacity-50 pointer-events-none select-none">
        <Tabs defaultValue={tabs[0]}>
          <TabsList>
            {tabs.map(t => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {tabs.slice(0, 6).map(t => (
            <div key={t} className="border border-dashed border-border bg-card p-6">
              <div className="text-[10px] uppercase tracking-brand text-muted-foreground">Disabled</div>
              <div className="font-bold mt-1">{t}</div>
              <div className="h-2 bg-muted mt-4" />
              <div className="h-2 bg-muted mt-2 w-2/3" />
              <div className="h-2 bg-muted mt-2 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}