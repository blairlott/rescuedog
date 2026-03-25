import { useState, useEffect } from "react";
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
import { Shield, ShieldCheck, UserCog, CheckCircle, XCircle, Clock, UserPlus, Globe, MapPin, Map } from "lucide-react";
import { toast } from "sonner";

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
  { value: "brand_ambassador", label: "Brand Ambassador", icon: UserCog },
  { value: "sales_rep", label: "Sales Rep", icon: UserCog },
];

const roleBadgeColors: Record<string, string> = {
  owner: "bg-primary text-primary-foreground",
  admin: "bg-accent text-accent-foreground",
  national_manager: "bg-blue-100 text-blue-800",
  regional_manager: "bg-indigo-100 text-indigo-800",
  state_manager: "bg-purple-100 text-purple-800",
  brand_ambassador: "bg-amber-100 text-amber-800",
  sales_rep: "bg-muted text-muted-foreground",
};

export default function CrmAdminPage() {
  const { data: roleInfo } = useUserRole();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", full_name: "", role: "" });
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("id, email, full_name, approved");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");

    const userMap = new Map<string, UserWithRoles>();
    (profiles || []).forEach((p: any) => {
      userMap.set(p.id, { id: p.id, email: p.email, full_name: p.full_name, approved: p.approved ?? false, roles: [] });
    });
    (roles || []).forEach((r: any) => {
      const u = userMap.get(r.user_id);
      if (u) u.roles.push(r.role as AppRole);
    });

    setUsers(Array.from(userMap.values()));
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const approveUser = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({ approved: true } as any).eq("id", userId);
    if (error) { toast.error(error.message); return; }
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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: createForm,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`User ${createForm.email} created and approved`);
      setCreateOpen(false);
      setCreateForm({ email: "", full_name: "", role: "" });
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">Approve signups, create users, and assign roles.</p>
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
          </TabsList>
          <TabsContent value="pending" className="mt-4">
            {renderUserTable(pendingUsers, true)}
          </TabsContent>
          <TabsContent value="approved" className="mt-4">
            {renderUserTable(approvedUsers, false)}
          </TabsContent>
        </Tabs>
      )}

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={createForm.full_name} onChange={(e) => setCreateForm(f => ({ ...f, full_name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.filter(r => roleInfo?.isOwner || r.value !== "owner").map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>{creating ? "Creating..." : "Create & Approve"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
