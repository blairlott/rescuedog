import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { PartnersTab } from "@/components/dropship/PartnersTab";
import { SkusTab } from "@/components/dropship/SkusTab";
import { OrdersTab } from "@/components/dropship/OrdersTab";
import { PayoutsTab } from "@/components/dropship/PayoutsTab";
import { EventsTab } from "@/components/dropship/EventsTab";
import { CurationTab } from "@/components/dropship/CurationTab";
import { MarketplaceTab } from "@/components/dropship/MarketplaceTab";
import { HealthTrackingTab } from "@/components/dropship/HealthTrackingTab";
import { Truck } from "lucide-react";

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6 flex items-center gap-3">
        <Truck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-brand uppercase">Drop-Ship Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage merch fulfillment partners, SKUs, orders, and payouts.</p>
        </div>
      </header>
      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">Health & Tracking</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="skus">SKUs</TabsTrigger>
          <TabsTrigger value="curation">AI Curation</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="health" className="mt-6"><HealthTrackingTab /></TabsContent>
        <TabsContent value="orders" className="mt-6"><OrdersTab /></TabsContent>
        <TabsContent value="partners" className="mt-6"><PartnersTab /></TabsContent>
        <TabsContent value="skus" className="mt-6"><SkusTab /></TabsContent>
        <TabsContent value="curation" className="mt-6"><CurationTab /></TabsContent>
        <TabsContent value="marketplace" className="mt-6"><MarketplaceTab /></TabsContent>
        <TabsContent value="payouts" className="mt-6"><PayoutsTab /></TabsContent>
        <TabsContent value="activity" className="mt-6"><EventsTab /></TabsContent>
      </Tabs>
    </div>
  );
}