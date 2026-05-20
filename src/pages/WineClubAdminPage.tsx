import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Navigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wine, Users, Package, Sparkles, UserPlus, LogOut, Shield, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ClubTiersAdmin } from "@/components/wine-club/ClubTiersAdmin";

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

function useWineClubAccess() {
  const { user } = useCustomerAuth();
  return useQuery({
    queryKey: ["wine-club-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      const roleList = (roles || []).map((r: any) => r.role as string);
      const isOwner = roleList.includes("owner");
      const isAdmin = roleList.includes("admin");
      const isWineClubManager = roleList.includes("wine_club_manager");
      return {
        hasAccess: isOwner || isAdmin || isWineClubManager,
        canManageManagers: isOwner || isAdmin, // only owners/admins can add managers
        isOwner,
      };
    },
  });
}

function useAllMemberships() {
  return useQuery({
    queryKey: ["admin-wine-club-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wine_club_memberships")
        .select("*, tier:wine_club_tiers!tier_id(name, frequency, bottle_count)")
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
        .select("*, membership:wine_club_memberships(user_id, tier:wine_club_tiers!tier_id(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

function useWineClubManagers() {
  return useQuery({
    queryKey: ["wine-club-managers"],
    queryFn: async () => {
      // Get all users with wine_club_manager, admin, or owner roles
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (error) throw error;

      const managerUserIds = (roleRows || [])
        .filter((r: any) => ["owner", "admin", "wine_club_manager"].includes(r.role))
        .reduce((acc: Record<string, string[]>, r: any) => {
          if (!acc[r.user_id]) acc[r.user_id] = [];
          acc[r.user_id].push(r.role);
          return acc;
        }, {} as Record<string, string[]>);

      if (Object.keys(managerUserIds).length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", Object.keys(managerUserIds));

      return (profiles || []).map((p: any) => ({
        ...p,
        roles: managerUserIds[p.id] || [],
      }));
    },
  });
}

const statusColor: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
  pending: "bg-blue-100 text-blue-800",
};

function InviteManagerDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, full_name: fullName, role: "wine_club_manager" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Invited ${email} as a Wine Club Manager`);
      setEmail("");
      setFullName("");
      setOpen(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="uppercase tracking-brand text-sm font-bold">
          <UserPlus className="h-4 w-4 mr-2" /> Invite Manager
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Wine Club Manager</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleInvite} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="invite-name">Full Name</Label>
            <Input
              id="invite-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="jane@rescuedogwines.com"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            They'll receive a temporary password and be prompted to reset it on first login.
          </p>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Inviting..." : "Send Invitation"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const WineClubAdminPage = () => {
  const { user, loading: authLoading, signOut } = useCustomerAuth();
  const { data: access, isLoading: accessLoading } = useWineClubAccess();
  const { data: memberships, isLoading: membersLoading } = useAllMemberships();
  const { data: shipments, isLoading: shipmentsLoading } = useAllShipments();
  const { data: managers, refetch: refetchManagers } = useWineClubManagers();
  const qc = useQueryClient();

  if (authLoading || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Wine className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (!user || !access?.hasAccess) {
    return <Navigate to="/club/login" replace />;
  }

  const activeCount = memberships?.filter((m) => m.status === "active").length || 0;
  const totalCount = memberships?.length || 0;
  const pendingShipments = shipments?.filter((s) => ["draft", "ai_suggested", "admin_approved"].includes(s.status)).length || 0;

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Wine className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Wine Club Manager</h1>
                <p className="text-sm text-muted-foreground">
                  {user.email} · {access.isOwner ? "Owner" : access.canManageManagers ? "Admin" : "Manager"}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="text-xs uppercase tracking-brand">
              <LogOut className="h-4 w-4 mr-1" /> Sign Out
            </Button>
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
              <TabsTrigger value="tiers">
                <Settings className="h-4 w-4 mr-1" /> Tiers
              </TabsTrigger>
              {access.canManageManagers && (
                <TabsTrigger value="managers">
                  <Shield className="h-4 w-4 mr-1" /> Managers
                </TabsTrigger>
              )}
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

            <TabsContent value="tiers" className="mt-6">
              <ClubTiersAdmin />
            </TabsContent>

            {access.canManageManagers && (
              <TabsContent value="managers" className="mt-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-foreground">Wine Club Managers</h3>
                  <InviteManagerDialog onSuccess={() => refetchManagers()} />
                </div>

                {!managers?.length ? (
                  <div className="border border-border p-12 text-center">
                    <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-foreground mb-2">No Managers Yet</h3>
                    <p className="text-sm text-muted-foreground">Invite team members to help manage the wine club.</p>
                  </div>
                ) : (
                  <div className="border border-border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Roles</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {managers.map((m: any) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">{m.full_name || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {m.roles.map((r: string) => (
                                  <Badge key={r} variant={r === "owner" ? "default" : "secondary"} className="text-xs uppercase">
                                    {r.replace(/_/g, " ")}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default WineClubAdminPage;
