import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { findArea, REQUESTABLE_ROLES_BY_AREA } from "@/lib/adminAreas";

type RequestRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  requested_area: string;
  requested_role: string | null;
  message: string | null;
  status: string;
  created_at: string;
};

interface Props {
  onChanged?: () => void;
}

export function AccessRequestsTab({ onChanged }: Props) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("access_requests")
      .select("id, user_id, user_email, user_name, requested_area, requested_role, message, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as RequestRow[] | null) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const approve = async (row: RequestRow) => {
    const chosenRole = overrides[row.id] || row.requested_role;
    if (!chosenRole) {
      toast.error("Pick a role to grant first.");
      return;
    }
    setBusyId(row.id);
    const { error: roleErr } = await supabase
      .from("user_roles")
      .insert({ user_id: row.user_id, role: chosenRole as any });
    if (roleErr && roleErr.code !== "23505") {
      setBusyId(null);
      toast.error(roleErr.message);
      return;
    }
    const { error: updErr } = await supabase
      .from("access_requests")
      .update({ status: "approved", reviewed_at: new Date().toISOString() } as any)
      .eq("id", row.id);
    // Also flip the profile to approved so they can pass the approval gate.
    await supabase.from("profiles").update({ approved: true } as any).eq("id", row.user_id);
    setBusyId(null);
    if (updErr) { toast.error(updErr.message); return; }
    toast.success(`Granted ${chosenRole} to ${row.user_email || "user"}`);
    load();
    onChanged?.();
  };

  const deny = async (row: RequestRow) => {
    setBusyId(row.id);
    const { error } = await supabase
      .from("access_requests")
      .update({ status: "denied", reviewed_at: new Date().toISOString() } as any)
      .eq("id", row.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Request denied");
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading access requests…</p>;
  if (rows.length === 0) {
    return (
      <div className="border border-border bg-background p-8 text-center text-sm text-muted-foreground">
        No pending access requests.
      </div>
    );
  }

  return (
    <div className="border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Area</TableHead>
            <TableHead>Requested role</TableHead>
            <TableHead>Grant role</TableHead>
            <TableHead>Message</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const area = findArea(r.requested_area);
            const options = REQUESTABLE_ROLES_BY_AREA[r.requested_area] || [];
            const labelFor = (v: string | null) =>
              v ? options.find((o) => o.value === v)?.label || v : "—";
            const current = overrides[r.id] || r.requested_role || "";
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.user_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.user_email || "—"}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {new Date(r.created_at).toLocaleString()}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{area?.title || r.requested_area}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{labelFor(r.requested_role)}</Badge>
                </TableCell>
                <TableCell>
                  <Select
                    value={current}
                    onValueChange={(v) => setOverrides((o) => ({ ...o, [r.id]: v }))}
                  >
                    <SelectTrigger className="w-[220px] h-8 text-xs">
                      <SelectValue placeholder="Pick role to grant…" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {current && current !== r.requested_role && (
                    <div className="text-[10px] text-amber-700 mt-1">
                      Overriding requested role
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[260px]">
                  {r.message ? <div className="whitespace-pre-wrap">{r.message}</div> : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => approve(r)}
                      disabled={busyId === r.id}
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={() => deny(r)}
                      disabled={busyId === r.id}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Deny
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}