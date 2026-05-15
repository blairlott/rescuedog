import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { RefreshCw, Copy, Send, XCircle, Mail, Clock, CheckCircle2, AlertCircle } from "lucide-react";

type Invitation = {
  id: string;
  email: string;
  full_name: string | null;
  roles: string[];
  surface: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  recovery_link: string | null;
  created_at: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  last_sign_in_at: string | null;
};

const STATUS_STYLE: Record<Invitation["status"], { label: string; className: string; icon: any }> = {
  pending:  { label: "Pending",  className: "bg-amber-100 text-amber-800 border-amber-200",  icon: Clock },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
  expired:  { label: "Expired",  className: "bg-muted text-muted-foreground border-border", icon: AlertCircle },
  revoked:  { label: "Revoked",  className: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
};

function formatRel(iso: string) {
  const d = new Date(iso).getTime();
  const diff = d - Date.now();
  const abs = Math.abs(diff);
  const day = 86400_000;
  const hr = 3600_000;
  const min = 60_000;
  const fmt = (n: number, u: string) => `${Math.round(n)} ${u}${Math.round(n) === 1 ? "" : "s"}`;
  const value = abs >= day ? fmt(abs / day, "day") : abs >= hr ? fmt(abs / hr, "hour") : fmt(abs / min, "min");
  return diff >= 0 ? `in ${value}` : `${value} ago`;
}

interface Props {
  /** Optional surface filter ("cms" | "crm" | "admin") */
  surface?: "cms" | "crm" | "admin";
}

export function TeamInvitationsList({ surface }: Props) {
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const path = surface ? `?surface=${surface}` : "";
      const { data, error } = await supabase.functions.invoke(`list-team-invitations${path}`, { method: "GET" });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setItems((data?.invitations as Invitation[]) ?? []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load invitations");
    } finally {
      setLoading(false);
    }
  }, [surface]);

  useEffect(() => { void load(); }, [load]);

  const handleCopy = (link: string | null) => {
    if (!link) {
      toast.error("No setup link on this invite — resend to generate one.");
      return;
    }
    navigator.clipboard.writeText(link);
    toast.success("Setup link copied");
  };

  const handleResend = async (id: string) => {
    setBusyId(id);
    try {
      const { data, error } = await supabase.functions.invoke(`list-team-invitations?action=resend`, {
        method: "POST",
        body: { id, redirect_to: `${window.location.origin}/reset-password`, expires_in_days: 7 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Invitation refreshed — new setup link generated");
      if (data?.recovery_link) {
        navigator.clipboard.writeText(data.recovery_link);
        toast.success("New setup link copied to clipboard");
      }
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to resend");
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this invitation? The setup link will stop working.")) return;
    setBusyId(id);
    try {
      const { data, error } = await supabase.functions.invoke(`list-team-invitations?action=revoke`, {
        method: "POST",
        body: { id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Invitation revoked");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Invitations</h3>
          <p className="text-xs text-muted-foreground">
            {items.length} total · pending invites expire after 7 days.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <div className="border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          No invitations yet.
        </div>
      ) : (
        <div className="border border-border divide-y divide-border bg-background">
          {items.map((inv) => {
            const s = STATUS_STYLE[inv.status];
            const Icon = s.icon;
            const isPending = inv.status === "pending";
            const isExpired = inv.status === "expired";
            return (
              <div key={inv.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground truncate">{inv.email}</span>
                    <Badge variant="outline" className={`${s.className} gap-1 text-xs`}>
                      <Icon className="h-3 w-3" /> {s.label}
                    </Badge>
                    <Badge variant="outline" className="text-xs uppercase">{inv.surface}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {inv.full_name ? `${inv.full_name} · ` : ""}
                    Roles: {inv.roles.length ? inv.roles.map((r) => r.replace(/_/g, " ")).join(", ") : "—"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                    <span>Sent {formatRel(inv.created_at)}</span>
                    {inv.status === "accepted" && inv.accepted_at && (
                      <span>Accepted {formatRel(inv.accepted_at)}</span>
                    )}
                    {(isPending || isExpired) && (
                      <span>
                        {isExpired ? "Expired " : "Expires "}
                        {formatRel(inv.expires_at)}
                      </span>
                    )}
                  </div>
                  {isPending && inv.recovery_link && (
                    <div className="mt-2 flex gap-2">
                      <Input readOnly value={inv.recovery_link} className="font-mono text-[11px] h-8" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {isPending && inv.recovery_link && (
                    <Button variant="outline" size="sm" onClick={() => handleCopy(inv.recovery_link)} className="gap-1">
                      <Copy className="h-3.5 w-3.5" /> Copy link
                    </Button>
                  )}
                  {(isPending || isExpired || inv.status === "revoked") && (
                    <Button variant="outline" size="sm" disabled={busyId === inv.id} onClick={() => handleResend(inv.id)} className="gap-1">
                      <Send className="h-3.5 w-3.5" /> Resend
                    </Button>
                  )}
                  {isPending && (
                    <Button variant="ghost" size="sm" disabled={busyId === inv.id} onClick={() => handleRevoke(inv.id)} className="gap-1 text-destructive hover:text-destructive">
                      <XCircle className="h-3.5 w-3.5" /> Revoke
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}