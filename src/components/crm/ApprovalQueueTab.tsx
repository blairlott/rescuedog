import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

interface PendingUser {
  id: string;
  email: string | null;
  full_name: string | null;
}

export function ApprovalQueueTab() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);

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

  const rejectUser = async (userId: string) => {
    toast.info("User remains unapproved");
    fetchPending();
  };

  if (loading) return <p className="text-muted-foreground py-4">Loading...</p>;

  if (pendingUsers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
        <p>No pending approvals</p>
      </div>
    );
  }

  return (
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
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1 text-green-700 border-green-300 hover:bg-green-50" onClick={() => approveUser(u.id)}>
                    <CheckCircle className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => rejectUser(u.id)}>
                    <XCircle className="h-3.5 w-3.5" /> Dismiss
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
