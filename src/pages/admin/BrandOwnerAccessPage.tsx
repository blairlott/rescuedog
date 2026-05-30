import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldCheck, AlertTriangle, Trash2, Search, UserPlus } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";

const LA_TZ = "America/Los_Angeles";

type BrandOwner = { user_id: string; email: string; granted_at: string | null };
type LogEntry = {
  id: string;
  action: "grant" | "revoke";
  target_email: string | null;
  performed_by_email: string | null;
  note: string | null;
  created_at: string;
};

export default function BrandOwnerAccessPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: roleInfo, isLoading: roleLoading } = useUserRole();

  const [email, setEmail] = useState("");
  const [foundUser, setFoundUser] = useState<{ user_id: string; email: string } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [grantNote, setGrantNote] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<BrandOwner | null>(null);
  const [revokeNote, setRevokeNote] = useState("");

  const owners = useQuery({
    queryKey: ["brand-owners"],
    queryFn: async (): Promise<BrandOwner[]> => {
      const { data, error } = await (supabase as any).rpc("list_brand_owners");
      if (error) throw error;
      return data || [];
    },
    enabled: !!roleInfo?.isOwner,
  });

  const log = useQuery({
    queryKey: ["brand-owner-access-log"],
    queryFn: async (): Promise<LogEntry[]> => {
      const { data, error } = await (supabase as any)
        .from("brand_owner_access_log")
        .select("id,action,target_email,performed_by_email,note,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as LogEntry[];
    },
    enabled: !!roleInfo?.isOwner,
  });

  const search = useMutation({
    mutationFn: async () => {
      setSearchError(null);
      setFoundUser(null);
      const { data, error } = await (supabase as any).rpc("find_user_by_email", { _email: email.trim() });
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("No user found with that email");
      setFoundUser(data[0]);
    },
    onError: (e: any) => setSearchError(e?.message || "Search failed"),
  });

  const grant = useMutation({
    mutationFn: async () => {
      if (!foundUser) throw new Error("Search for a user first");
      const { error } = await (supabase as any).rpc("grant_brand_owner_access", {
        _target_user_id: foundUser.user_id,
        _note: grantNote.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-owners"] });
      qc.invalidateQueries({ queryKey: ["brand-owner-access-log"] });
      setEmail("");
      setFoundUser(null);
      setGrantNote("");
      toast({ title: "Brand owner access granted" });
    },
    onError: (e: any) => toast({ title: "Grant failed", description: e?.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: async () => {
      if (!revokeTarget) return;
      const { error } = await (supabase as any).rpc("revoke_brand_owner_access", {
        _target_user_id: revokeTarget.user_id,
        _note: revokeNote.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-owners"] });
      qc.invalidateQueries({ queryKey: ["brand-owner-access-log"] });
      setRevokeTarget(null);
      setRevokeNote("");
      toast({ title: "Brand owner access revoked" });
    },
    onError: (e: any) => toast({ title: "Revoke failed", description: e?.message, variant: "destructive" }),
  });

  if (roleLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  if (!roleInfo?.isOwner) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-3">
        <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-bold">Brand Owner Access — Restricted</h1>
        <p className="text-sm text-muted-foreground">
          Only owners can grant or revoke brand_owner access. This action is logged.
        </p>
        <Button variant="outline" onClick={() => navigate("/crm")}>Back to CRM</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold uppercase tracking-brand flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Brand Owner Access
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Brand owners can edit CMS content marked as brand-sensitive (e.g. markdown body, press mentions, schedule fields).
          Every grant and revoke is recorded in the audit log below.
        </p>
      </header>

      <section className="border border-border rounded p-4 space-y-3">
        <h2 className="font-bold uppercase text-sm tracking-brand">Grant access</h2>
        <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <Label htmlFor="grant-email">User email</Label>
            <Input
              id="grant-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFoundUser(null); setSearchError(null); }}
              placeholder="user@example.com"
            />
          </div>
          <Button type="button" onClick={() => search.mutate()} disabled={!email.trim() || search.isPending}>
            <Search className="h-4 w-4" /> {search.isPending ? "Searching…" : "Find user"}
          </Button>
        </div>
        {searchError && <p className="text-xs text-destructive">{searchError}</p>}
        {foundUser && (
          <div className="rounded border border-border bg-muted/20 p-3 space-y-3">
            <p className="text-sm">
              Found: <span className="font-medium">{foundUser.email}</span>
            </p>
            <div>
              <Label htmlFor="grant-note" className="text-xs">Note (optional, recorded in audit log)</Label>
              <Input
                id="grant-note"
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
                placeholder="e.g. Blair — primary brand editor"
              />
            </div>
            <Button type="button" onClick={() => grant.mutate()} disabled={grant.isPending}>
              <UserPlus className="h-4 w-4" /> {grant.isPending ? "Granting…" : "Grant brand_owner"}
            </Button>
          </div>
        )}
      </section>

      <section className="border border-border rounded">
        <header className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="font-bold uppercase text-sm tracking-brand">Current brand owners</h2>
          <span className="text-xs text-muted-foreground">{owners.data?.length ?? 0}</span>
        </header>
        {owners.isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
        {!owners.isLoading && (owners.data?.length ?? 0) === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No brand owners yet. Grant access above.
          </div>
        )}
        <ul className="divide-y divide-border">
          {(owners.data || []).map((o) => (
            <li key={o.user_id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{o.email}</div>
                <div className="text-[11px] text-muted-foreground">
                  {o.granted_at ? `Granted ${formatInTimeZone(new Date(o.granted_at), LA_TZ, "MMM d, yyyy HH:mm")} PT` : "Granted (date unknown)"}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setRevokeTarget(o)}>
                <Trash2 className="h-3.5 w-3.5" /> Revoke
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-border rounded">
        <header className="px-4 py-2 border-b border-border bg-muted/30">
          <h2 className="font-bold uppercase text-sm tracking-brand">Audit log</h2>
          <p className="text-[11px] text-muted-foreground">Most recent 100 entries.</p>
        </header>
        {log.isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
        <ul className="divide-y divide-border">
          {(log.data || []).map((e) => (
            <li key={e.id} className="px-4 py-2 text-sm grid grid-cols-[110px_70px_1fr] gap-3 items-baseline">
              <span className="text-[11px] text-muted-foreground">
                {formatInTimeZone(new Date(e.created_at), LA_TZ, "MMM d HH:mm")} PT
              </span>
              <span className={`text-[10px] uppercase tracking-brand font-bold ${
                e.action === "grant" ? "text-emerald-700" : "text-destructive"
              }`}>{e.action}</span>
              <span>
                <span className="font-medium">{e.target_email || "—"}</span>
                {" by "}
                <span className="text-muted-foreground">{e.performed_by_email || "—"}</span>
                {e.note && <span className="text-muted-foreground italic"> — {e.note}</span>}
              </span>
            </li>
          ))}
          {!log.isLoading && (log.data?.length ?? 0) === 0 && (
            <li className="p-4 text-sm text-muted-foreground text-center">No audit entries yet.</li>
          )}
        </ul>
      </section>

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) { setRevokeTarget(null); setRevokeNote(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke brand_owner from {revokeTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose the ability to edit CMS markdown bodies, schedule fields, and press mentions.
              This action is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label htmlFor="revoke-note" className="text-xs">Note (optional)</Label>
            <Input id="revoke-note" value={revokeNote} onChange={(e) => setRevokeNote(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => revoke.mutate()}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}