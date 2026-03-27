import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wine, Users, Package, Sparkles } from "lucide-react";

interface MemberRow {
  id: string;
  user_id: string;
  status: string;
  payment_status: string;
  shipping_city: string | null;
  shipping_state: string | null;
  joined_at: string;
  next_shipment_date: string | null;
  wine_preferences: string[];
  tier: { name: string; frequency: string; bottle_count: number } | null;
}

function useAllMemberships() {
  return useQuery({
    queryKey: ["admin-wine-club-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wine_club_memberships")
        .select("*, tier:wine_club_tiers(name, frequency, bottle_count)")
        .order("joined_at", { ascending: false });
      if (error) throw error;
      return data as MemberRow[];
    },
  });
}

function useAllShipments() {
  return useQuery({
    queryKey: ["admin-wine-club-shipments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wine_club_shipments")
        .select("*, membership:wine_club_memberships(user_id, tier:wine_club_tiers(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

const statusColor: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
  pending: "bg-blue-100 text-blue-800",
};

const WineClubAdminPage = () => {
  const { user, loading: authLoading } = useCustomerAuth();
  const { data: roleInfo, isLoading: roleLoading } = useUserRole();
  const isAdminOrOwner = roleInfo?.isAdminOrOwner ?? false;
  const { data: memberships, isLoading: membersLoading } = useAllMemberships();
  const { data: shipments, isLoading: shipmentsLoading } = useAllShipments();

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Wine className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (!user || !isAdminOrOwner) {
    return <Navigate to="/login" replace />;
  }

  const activeCount = memberships?.filter((m) => m.status === "active").length || 0;
  const totalCount = memberships?.length || 0;
  const pendingShipments = shipments?.filter((s) => ["draft", "ai_suggested", "admin_approved"].includes(s.status)).length || 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-8">
            <Wine className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Wine Club Admin</h1>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="border border-border p-5">
              <Users className="h-5 w-5 text-muted-foreground mb-2" />
              <p className="text-2xl font-bold text-foreground">{totalCount}</p>
              <p className="text-sm text-muted-foreground">Total Members</p>
            </div>
            <div className="border border-border p-5">
              <Users className="h-5 w-5 text-primary mb-2" />
              <p className="text-2xl font-bold text-foreground">{activeCount}</p>
              <p className="text-sm text-muted-foreground">Active Members</p>
            </div>
            <div className="border border-border p-5">
              <Package className="h-5 w-5 text-muted-foreground mb-2" />
              <p className="text-2xl font-bold text-foreground">{pendingShipments}</p>
              <p className="text-sm text-muted-foreground">Pending Shipments</p>
            </div>
            <div className="border border-border p-5">
              <Sparkles className="h-5 w-5 text-muted-foreground mb-2" />
              <p className="text-2xl font-bold text-foreground">AI</p>
              <p className="text-sm text-muted-foreground">Curation Engine</p>
            </div>
          </div>

          <Tabs defaultValue="members">
            <TabsList>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="shipments">Shipments</TabsTrigger>
            </TabsList>

            <TabsContent value="members" className="mt-6">
              {membersLoading ? (
                <p className="text-muted-foreground">Loading members...</p>
              ) : !memberships?.length ? (
                <div className="border border-border p-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-foreground mb-2">No Members Yet</h3>
                  <p className="text-sm text-muted-foreground">Members will appear here when customers join the wine club.</p>
                </div>
              ) : (
                <div className="border border-border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Club Tier</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Next Shipment</TableHead>
                        <TableHead>Preferences</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {memberships.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.tier?.name || "—"}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 text-xs font-bold uppercase ${statusColor[m.status] || "bg-muted text-muted-foreground"}`}>
                              {m.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{m.payment_status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {m.shipping_city && m.shipping_state ? `${m.shipping_city}, ${m.shipping_state}` : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(m.joined_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {m.next_shipment_date ? new Date(m.next_shipment_date).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(m.wine_preferences || []).slice(0, 2).map((p) => (
                                <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                              ))}
                              {(m.wine_preferences || []).length > 2 && (
                                <Badge variant="secondary" className="text-xs">+{m.wine_preferences.length - 2}</Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="shipments" className="mt-6">
              {shipmentsLoading ? (
                <p className="text-muted-foreground">Loading shipments...</p>
              ) : !shipments?.length ? (
                <div className="border border-border p-12 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-foreground mb-2">No Shipments Yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Shipments will be created here when the AI suggests selections for members.
                  </p>
                </div>
              ) : (
                <div className="border border-border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Club Tier</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ship Date</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shipments.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            {s.membership?.tier?.name || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs uppercase">{s.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.shipment_date ? new Date(s.shipment_date).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.tracking_number || "—"}
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" className="text-xs">
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default WineClubAdminPage;
