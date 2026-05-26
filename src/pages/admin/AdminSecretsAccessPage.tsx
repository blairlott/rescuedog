import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, KeyRound, Plus } from "lucide-react";

interface Credential {
  id: string;
  provider: string;
  credential_key: string;
  scope: string;
  updated_at: string;
}

interface Grant {
  id: string;
  user_id: string;
  scope: string;
  can_write: boolean;
  expires_at: string | null;
  note: string | null;
  granted_at: string;
  profile_email?: string | null;
  profile_name?: string | null;
}

interface ProfileLite {
  id: string;
  email: string | null;
  full_name: string | null;
}

export default function AdminSecretsAccessPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: roleInfo, isLoading: roleLoading } = useUserRole();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [grantEmail, setGrantEmail] = useState("");
  const [grantScope, setGrantScope] = useState("all");
  const [grantCanWrite, setGrantCanWrite] = useState(false);
  const [grantExpiry, setGrantExpiry] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (roleLoading) return;
    if (!roleInfo?.isOwner) {
      navigate("/admin", { replace: true });
    }
  }, [roleInfo, roleLoading, navigate]);

  const load = async () => {
    setLoading(true);
    const [credRes, grantRes, profRes] = await Promise.all([
      supabase.from("integration_credentials").select("id, provider, credential_key, scope, updated_at").order("provider"),
      supabase.from("credential_grants").select("*").order("granted_at", { ascending: false }),
      supabase.from("profiles").select("id, email, full_name").order("email"),
    ]);
    setCredentials((credRes.data as Credential[]) || []);
    const profs = (profRes.data as ProfileLite[]) || [];
    setProfiles(profs);
    const profMap = new Map(profs.map((p) => [p.id, p]));
    const enriched = ((grantRes.data as Grant[]) || []).map((g) => ({
      ...g,
      profile_email: profMap.get(g.user_id)?.email ?? null,
      profile_name: profMap.get(g.user_id)?.full_name ?? null,
    }));
    setGrants(enriched);
    setLoading(false);
  };

  useEffect(() => {
    if (roleInfo?.isOwner) load();
  }, [roleInfo?.isOwner]);

  const providers = useMemo(() => {
    const set = new Set<string>(credentials.map((c) => c.provider));
    return Array.from(set).sort();
  }, [credentials]);

  const addGrant = async () => {
    if (!grantEmail.trim()) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    const match = profiles.find(
      (p) => (p.email || "").toLowerCase().trim() === grantEmail.toLowerCase().trim(),
    );
    if (!match) {
      toast({ title: "User not found", description: "That email has no profile yet.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("credential_grants").insert({
      user_id: match.id,
      scope: grantScope || "all",
      can_write: grantCanWrite,
      expires_at: grantExpiry ? new Date(grantExpiry).toISOString() : null,
      note: grantNote.trim() || null,
      granted_by: (await supabase.auth.getUser()).data.user?.id,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to grant", description: error.message, variant: "destructive" });
      return;
    }
    setGrantEmail("");
    setGrantNote("");
    setGrantExpiry("");
    setGrantCanWrite(false);
    setGrantScope("all");
    toast({ title: "Access granted" });
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this access grant?")) return;
    const { error } = await supabase.from("credential_grants").delete().eq("id", id);
    if (error) {
      toast({ title: "Revoke failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Grant revoked" });
    load();
  };

  if (roleLoading || !roleInfo) {
    return <div className="min-h-dvh flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!roleInfo.isOwner) return null;

  return (
    <div className="min-h-dvh bg-secondary">
      <AdminTopNav roles={roleInfo.roles} />
      <main className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-primary" />
            Secrets & Token Access
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            API tokens and integration secrets are owner-only by default. Use this page to explicitly grant
            another user read or read/write access — for a single provider or all of them.
          </p>
        </div>

        <Card className="p-4 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Grant Access</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="g-email">User email</Label>
              <Input id="g-email" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="dev@example.com" />
            </div>
            <div>
              <Label htmlFor="g-scope">Scope</Label>
              <select
                id="g-scope"
                className="w-full h-10 px-3 border border-input bg-background text-sm"
                value={grantScope}
                onChange={(e) => setGrantScope(e.target.value)}
              >
                <option value="all">All providers</option>
                {providers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="g-exp">Expires at (optional)</Label>
              <Input id="g-exp" type="datetime-local" value={grantExpiry} onChange={(e) => setGrantExpiry(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="g-write" checked={grantCanWrite} onCheckedChange={(v) => setGrantCanWrite(!!v)} />
              <Label htmlFor="g-write" className="cursor-pointer">Allow editing (read + write)</Label>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="g-note">Note (optional)</Label>
              <Input id="g-note" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="e.g. contractor debugging Shopify webhooks" />
            </div>
          </div>
          <Button onClick={addGrant} disabled={saving}>
            {saving ? "Granting…" : "Grant Access"}
          </Button>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold mb-3">Active Grants ({grants.length})</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one besides you has access. Secrets are owner-only.</p>
          ) : (
            <div className="space-y-2">
              {grants.map((g) => {
                const expired = g.expires_at && new Date(g.expires_at) < new Date();
                return (
                  <div key={g.id} className="flex items-center justify-between border border-border p-3 gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {g.profile_name || g.profile_email || g.user_id}
                        {g.profile_email && g.profile_name && (
                          <span className="text-xs text-muted-foreground ml-2">{g.profile_email}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="outline">{g.scope === "all" ? "All providers" : g.scope}</Badge>
                        <Badge variant={g.can_write ? "default" : "secondary"}>
                          {g.can_write ? "Read + write" : "Read only"}
                        </Badge>
                        {g.expires_at && (
                          <Badge variant={expired ? "destructive" : "outline"}>
                            {expired ? "Expired" : `Until ${new Date(g.expires_at).toLocaleDateString()}`}
                          </Badge>
                        )}
                      </div>
                      {g.note && <p className="text-xs text-muted-foreground mt-1">{g.note}</p>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => revoke(g.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold mb-3">Stored Credentials ({credentials.length})</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : credentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credentials stored.</p>
          ) : (
            <div className="text-sm">
              <div className="grid grid-cols-3 gap-2 font-medium text-muted-foreground border-b border-border pb-2 mb-2">
                <div>Provider</div>
                <div>Key</div>
                <div>Updated</div>
              </div>
              {credentials.map((c) => (
                <div key={c.id} className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <div className="font-mono">{c.provider}</div>
                  <div className="font-mono text-muted-foreground">{c.credential_key}</div>
                  <div className="text-muted-foreground">{new Date(c.updated_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Values are never displayed here. Edit them in the provider-specific integration pages.
          </p>
        </Card>
      </main>
    </div>
  );
}