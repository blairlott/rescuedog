import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";

export default function FinanceUsersPage() {
  const { data: roleInfo } = useUserRole();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");

  const { data: members, isLoading } = useQuery({
    queryKey: ["cfo_members"],
    queryFn: async () => {
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "cfo" as any);
      if (error) throw error;
      const ids = (roleRows ?? []).map(r => r.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", ids);
      return (profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>;
    },
  });

  const { data: pending } = useQuery({
    queryKey: ["cfo_pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_role_grants" as any)
        .select("id, email, role, applied_at")
        .eq("role", "cfo" as any)
        .is("applied_at", null);
      if (error) { console.warn(error.message); return []; }
      return (data ?? []) as Array<{ id: string; email: string; role: string }>;
    },
  });

  if (!roleInfo?.isAdminOrOwner) {
    return <div className="container mx-auto p-6 text-muted-foreground">Owner/admin only.</div>;
  }

  const grant = async () => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    // Look up an existing profile by email
    const { data: profile } = await supabase.from("profiles").select("id").eq("email", e).maybeSingle();
    if (profile?.id) {
      const { error } = await supabase.from("user_roles").insert({ user_id: profile.id, role: "cfo" as any });
      if (error) { toast.error(error.message); return; }
      toast.success("CFO access granted");
    } else {
      const { error } = await supabase.from("pending_role_grants" as any).insert({ email: e, role: "cfo" });
      if (error) { toast.error(error.message); return; }
      toast.success("Pending grant created — will apply on first sign-in");
    }
    setEmail("");
    qc.invalidateQueries({ queryKey: ["cfo_members"] });
    qc.invalidateQueries({ queryKey: ["cfo_pending"] });
  };

  const revoke = async (userId: string) => {
    if (!confirm("Revoke CFO access for this user?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "cfo" as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Access revoked");
    qc.invalidateQueries({ queryKey: ["cfo_members"] });
  };

  const cancelPending = async (id: string) => {
    const { error } = await supabase.from("pending_role_grants" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["cfo_pending"] });
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finance Access</h1>
        <p className="text-sm text-muted-foreground">
          Grant CFO-only access to the Finance dashboard. Owners, admins, and executives already have access automatically.
        </p>
      </div>

      <div className="border border-border bg-card p-4 space-y-3">
        <div className="text-sm font-bold uppercase tracking-brand">Grant CFO access</div>
        <div className="flex gap-2">
          <Input
            placeholder="email@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
          />
          <Button onClick={grant}><UserPlus className="h-4 w-4 mr-1" /> Grant</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          If the email belongs to an existing user, access is granted instantly. Otherwise we create a pending grant that activates the moment they sign up.
        </p>
      </div>

      <div className="border border-border bg-card">
        <div className="px-4 py-3 border-b border-border text-sm font-bold uppercase tracking-brand">CFO members</div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : !members?.length ? (
          <div className="p-4 text-sm text-muted-foreground">No CFO users yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {members.map(m => (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium">{m.full_name || m.email}</div>
                  {m.full_name && <div className="text-xs text-muted-foreground">{m.email}</div>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => revoke(m.id)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending && pending.length > 0 && (
        <div className="border border-border bg-card">
          <div className="px-4 py-3 border-b border-border text-sm font-bold uppercase tracking-brand">Pending grants</div>
          <ul className="divide-y divide-border">
            {pending.map(p => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <div className="text-sm">{p.email}</div>
                <Button variant="ghost" size="sm" onClick={() => cancelPending(p.id)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Cancel
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}