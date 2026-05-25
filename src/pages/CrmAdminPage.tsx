import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, ShieldCheck, UserCog, CheckCircle, XCircle, Clock, UserPlus, Globe, MapPin, Map, Gift, Heart, Wine, Truck, FileText, Mail } from "lucide-react";
import { toast } from "sonner";
import { ReferralAdminTab } from "@/components/crm/ReferralAdminTab";
import { TeamInviteDialog } from "@/components/team/TeamInviteDialog";
import { TeamInvitationsList } from "@/components/team/TeamInvitationsList";
import { TestEmailsCard } from "@/components/crm/TestEmailsCard";
import { DepletionUploadCard } from "@/components/crm/DepletionUploadCard";
import { AccessRequestsTab } from "@/components/crm/AccessRequestsTab";
import { isStaffEmail } from "@/lib/staffEmail";

interface UserWithRoles {
  id: string;
  email: string | null;
  full_name: string | null;
  approved: boolean;
  roles: AppRole[];
}

const ALL_ROLES: { value: AppRole; label: string; icon: typeof Shield }[] = [
  { value: "owner", label: "Owner", icon: ShieldCheck },
  { value: "admin", label: "Admin", icon: Shield },
  { value: "national_manager", label: "National Manager", icon: Globe },
  { value: "regional_manager", label: "Regional Manager", icon: Map },
  { value: "state_manager", label: "State Manager", icon: MapPin },
  { value: "brand_ambassador", label: "Brand Ambassador / Sales Rep", icon: UserCog },
  { value: "ambassador_manager", label: "Ambassador Manager", icon: Heart },
  { value: "wine_club_manager", label: "Wine Club Manager", icon: Wine },
  { value: "dropship_manager", label: "Drop-Ship Manager", icon: Truck },
  { value: "cms_editor", label: "CMS Editor", icon: FileText },
];

const roleBadgeColors: Record<string, string> = {
  owner: "bg-primary text-primary-foreground",
  admin: "bg-accent text-accent-foreground",
  national_manager: "bg-blue-100 text-blue-800",
  regional_manager: "bg-indigo-100 text-indigo-800",
  state_manager: "bg-purple-100 text-purple-800",
  brand_ambassador: "bg-amber-100 text-amber-800",
  ambassador_manager: "bg-rose-100 text-rose-800",
  wine_club_manager: "bg-teal-100 text-teal-800",
  dropship_manager: "bg-orange-100 text-orange-800",
  cms_editor: "bg-slate-100 text-slate-800",
};

export default function CrmAdminPage() {
  const { data: roleInfo } = useUserRole();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("id, email, full_name, approved");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");

    const userMap: globalThis.Map<string, UserWithRoles> = new globalThis.Map();
    (profiles || []).forEach((p: any) => {
      userMap.set(p.id, { id: p.id, email: p.email, full_name: p.full_name, approved: p.approved ?? false, roles: [] });
    });
    (roles || []).forEach((r: any) => {
      const u = userMap.get(r.user_id);
      if (u) u.roles.push(r.role as AppRole);
    });

    // Staff-only view: a profile counts as staff if it has at least one role
    // assigned OR uses a staff-domain email. Customer accounts (legacy
    // customer signups, Vinoshipper-mirrored buyers, etc.) live in
    // /admin/customers and must not appear here.
    const staffOnly = Array.from(userMap.values()).filter(
      (u) => u.roles.length > 0 || isStaffEmail(u.email),
    );
    setUsers(staffOnly);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [location.hash, loading]);

  const approveUser = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({ approved: true } as any).eq("id", userId);
    if (error) { toast.error(error.message); return; }
    // Resolve any pending access requests for this user.
    await supabase
      .from("access_requests")
      .update({ status: "approved", reviewed_at: new Date().toISOString() } as any)
      .eq("user_id", userId)
      .eq("status", "pending");
    toast.success("User approved");
    fetchUsers();
  };

  const rejectUser = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({ approved: false } as any).eq("id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("User access revoked");
    fetchUsers();
  };

  const addRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role } as any);
    if (error) {
      if (error.code === "23505") toast.info("User already has that role");
      else toast.error(error.message);
      return;
    }
    // Mark any pending access requests for this user as approved — granting
    // a role from the Users tab is the implicit approval action.
    await supabase
      .from("access_requests")
      .update({ status: "approved", reviewed_at: new Date().toISOString() } as any)
      .eq("user_id", userId)
      .eq("status", "pending");
    // Also flip the profile approved flag so they clear the approval gate.
    await supabase.from("profiles").update({ approved: true } as any).eq("id", userId);
    toast.success(`Role added`);
    fetchUsers();
    queryClient.invalidateQueries({ queryKey: ["user_role"] });
  };

  const removeRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`Role removed`);
    fetchUsers();
    queryClient.invalidateQueries({ queryKey: ["user_role"] });
  };

  // Invites handled by the shared <TeamInviteDialog />.

  if (!roleInfo?.isAdminOrOwner) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
      </div>
    );
  }

  const pendingUsers = users.filter(u => !u.approved);
  const approvedUsers = users.filter(u => u.approved);

  const getRoleInfo = (role: string) => ALL_ROLES.find(r => r.value === role) || ALL_ROLES[ALL_ROLES.length - 1];

  const renderUserTable = (userList: UserWithRoles[], showApprovalActions: boolean) => (
    <div className="border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {userList.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
              <TableCell className="text-sm">{u.email || "—"}</TableCell>
              <TableCell>
                {u.approved ? (
                  <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle className="h-3 w-3" /> Approved</Badge>
                ) : (
                  <Badge className="bg-yellow-100 text-yellow-800 gap-1"><Clock className="h-3 w-3" /> Pending</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {u.roles.length === 0 && <span className="text-xs text-muted-foreground">No role</span>}
                  {u.roles.map((r) => {
                    const ri = getRoleInfo(r);
                    const Icon = ri.icon;
                    return (
                      <Badge key={r} className={`${roleBadgeColors[r] || "bg-muted text-muted-foreground"} gap-1 text-xs`}>
                        <Icon className="h-3 w-3" />
                        {ri.label}
                        <button onClick={() => removeRole(u.id, r)} className="ml-1 hover:text-destructive">×</button>
                      </Badge>
                    );
                  })}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {showApprovalActions && !u.approved && (
                    <Button size="sm" variant="outline" className="gap-1 text-green-700 border-green-300 hover:bg-green-50" onClick={() => approveUser(u.id)}>
                      <CheckCircle className="h-3.5 w-3.5" /> Approve
                    </Button>
                  )}
                  {u.approved && (
                    <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => rejectUser(u.id)}>
                      <XCircle className="h-3.5 w-3.5" /> Revoke
                    </Button>
                  )}
                  <Select onValueChange={(v) => addRole(u.id, v as AppRole)}>
                    <SelectTrigger className="w-[170px] h-8 text-xs">
                      <SelectValue placeholder="Add role..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_ROLES.filter(r => roleInfo?.isOwner || r.value !== "owner").map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {userList.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users found</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff Users</h1>
          <p className="text-sm text-muted-foreground">
            Invite staff, approve access, and assign roles. Customer accounts live in{" "}
            <a href="/admin/customers" className="underline">Admin → Customers</a>.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1">
          <UserPlus className="h-4 w-4" /> Create User
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading users...</p>
      ) : (
        <Tabs defaultValue={pendingUsers.length > 0 ? "pending" : "approved"}>
          <TabsList>
            <TabsTrigger value="pending" className="gap-1">
              Pending Approval
              {pendingUsers.length > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800 ml-1 text-xs">{pendingUsers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved Users ({approvedUsers.length})</TabsTrigger>
            <TabsTrigger value="requests" className="gap-1">
              <Mail className="h-3.5 w-3.5" /> Access Requests
            </TabsTrigger>
            <TabsTrigger value="referrals" className="gap-1">
              <Gift className="h-3.5 w-3.5" /> Referrals
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-4">
            {renderUserTable(pendingUsers, true)}
          </TabsContent>
          <TabsContent value="approved" className="mt-4">
            {renderUserTable(approvedUsers, false)}
          </TabsContent>
          <TabsContent value="requests" className="mt-4">
            <AccessRequestsTab onChanged={fetchUsers} />
          </TabsContent>
          <TabsContent value="referrals" className="mt-4">
            <ReferralAdminTab />
          </TabsContent>
        </Tabs>
      )}

      <div className="mt-8 border border-border bg-background p-6">
        <TeamInvitationsList surface="crm" />
      </div>

      {roleInfo?.isOwner || roleInfo?.roles?.includes("admin") ? (
        <TestEmailsCard />
      ) : null}

      <DepletionUploadCard />

      <TeamInviteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultRoles={["crm_user"]}
        isOwner={!!roleInfo?.isOwner}
        title="Invite a CRM team member"
        surface="crm"
        onInvited={() => {
          fetchUsers();
          queryClient.invalidateQueries({ queryKey: ["user_role"] });
        }}
      />
    </div>
  );
}
