import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import type { AppRole } from "@/hooks/useUserRole";

const ALL_ROLES: { value: AppRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "national_manager", label: "National Manager" },
  { value: "regional_manager", label: "Regional Manager" },
  { value: "state_manager", label: "State Manager" },
  { value: "brand_ambassador", label: "Brand Ambassador" },
  { value: "sales_rep", label: "Sales Rep" },
];

interface PendingUser {
  id: string;
  email: string | null;
  full_name: string | null;
}

export function ApprovalQueueTab() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", full_name: "", role: "" });
  const [creating, setCreating] = useState(false);

  const fetchPending = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, approved")
      .eq("approved", false);
    setPendingUsers((data || []) as PendingUser[]);
    setLoading(false);
  };

  useEffect(() => { fetchPending(); }, []);

  const approveUser = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({ approved: true } as any).eq("id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("User approved");
    fetchPending();
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
      fetchPending();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <p className="text-muted-foreground py-4">Loading...</p>;

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex gap-2">
        <Button onClick={() => setCreateOpen(true)} className="gap-1">
          <UserPlus className="h-4 w-4" /> Create New User
        </Button>
        <Link to="/crm/admin">
          <Button variant="outline" className="gap-1">
            <Users className="h-4 w-4" /> Manage All Users & Roles
          </Button>
        </Link>
      </div>

      {/* Pending approvals */}
      {pendingUsers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-border rounded">
          <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
          <p>No pending approvals</p>
          <p className="text-xs mt-1">New signups will appear here for your review</p>
        </div>
      ) : (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                  <TableCell className="text-sm">{u.email || "—"}</TableCell>
                  <TableCell>
                    <Badge className="bg-yellow-100 text-yellow-800 gap-1">
                      <Clock className="h-3 w-3" /> Pending
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="gap-1 text-green-700 border-green-300 hover:bg-green-50" onClick={() => approveUser(u.id)}>
                      <CheckCircle className="h-3.5 w-3.5" /> Approve
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
                  {ALL_ROLES.map((r) => (
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

export function useApprovalCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("approved", false)
      .then(({ count: c }) => setCount(c || 0));
  }, []);
  return count;
}
