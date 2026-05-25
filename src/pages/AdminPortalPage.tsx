import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, Users, UserCircle } from "lucide-react";
import { ADMIN_AREAS, hasAreaAccess } from "@/lib/adminAreas";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { AbVariantTile } from "@/components/admin/AbVariantTile";
import { BarChart3, Bell } from "lucide-react";
import { FeatureRequestBox } from "@/components/admin/FeatureRequestBox";
import { FeatureRequestInbox } from "@/components/admin/FeatureRequestInbox";

type RoleRow = { role: string };
type PendingRequest = {
  id: string;
  user_email: string | null;
  user_name: string | null;
  requested_area: string;
  message: string | null;
  created_at: string;
};

const READ_ONLY_ROLES = new Set(["viewer", "executive"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);

const AdminPortalPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string | null; name: string | null } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const loadRoles = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    return ((data as RoleRow[] | null) || []).map((r) => r.role);
  };

  const loadPendingRequests = async (userRoles: string[]) => {
    if (!userRoles.some((r) => ADMIN_ROLES.has(r))) {
      setPendingRequests([]);
      return;
    }
    const { data } = await supabase
      .from("access_requests")
      .select("id, user_email, user_name, requested_area, message, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    setPendingRequests((data as PendingRequest[] | null) || []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("must_change_password, full_name")
          .eq("id", session.user.id)
          .maybeSingle();
        if (profile?.must_change_password) {
          navigate("/admin/change-password", { replace: true });
          return;
        }
        const userRoles = await loadRoles(session.user.id);
        setRoles(userRoles);
        setCurrentUser({ id: session.user.id, email: session.user.email ?? null, name: (profile as any)?.full_name ?? null });
        await loadPendingRequests(userRoles);
      } else setRoles(null);
      setChecking(false);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!mounted) return;
      if (session?.user) {
        const userRoles = await loadRoles(session.user.id);
        setRoles(userRoles);
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", session.user.id)
          .maybeSingle();
        setCurrentUser({ id: session.user.id, email: session.user.email ?? null, name: (profile as any)?.full_name ?? null });
        await loadPendingRequests(userRoles);
      } else { setRoles(null); setCurrentUser(null); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (!email.toLowerCase().endsWith("@rescuedogwines.com")) {
      toast({
        title: "Backend access restricted",
        description: "Only @rescuedogwines.com email addresses can sign in here.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      toast({ title: "Login failed", description: error?.message || "Invalid credentials.", variant: "destructive" });
      setLoading(false);
      return;
    }
    const userRoles = await loadRoles(data.user.id);
    // Force password change for newly-provisioned accounts
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile?.must_change_password) {
      setLoading(false);
      navigate("/admin/change-password", { replace: true });
      return;
    }
    setRoles(userRoles);
    await loadPendingRequests(userRoles);
    setLoading(false);
    toast({
      title: "Welcome back",
      description: userRoles.length === 0 ? "No roles assigned yet — you can request access below." : undefined,
    });
  };

  const handleForgot = async () => {
    if (!email) {
      toast({ title: "Enter your email first", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Check your email for a reset link." });
  };

  if (checking) {
    return <div className="min-h-dvh flex items-center justify-center bg-secondary text-muted-foreground text-sm">Loading…</div>;
  }

  // Logged out → unified login
  if (!roles) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-secondary px-4">
        <div className="w-full max-w-md">
          <div className="bg-background border border-border p-8 shadow-sm">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-4">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Admin Portal</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in to access CMS, CRM, and admin tools.</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="admin-email">Email</Label>
                <Input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div>
                <Label htmlFor="admin-password">Password</Label>
                <Input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
            <button type="button" onClick={handleForgot} className="mt-4 text-sm text-primary hover:underline block mx-auto">
              Forgot password?
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Logged in → portal landing
  return (
    <div className="min-h-dvh bg-secondary">
      <AdminTopNav roles={roles} />
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {pendingRequests.length > 0 && (
          <div className="mb-6 border border-primary/40 bg-primary/5 p-4 flex items-start gap-3">
            <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-bold text-foreground mb-1">
                {pendingRequests.length} pending access request{pendingRequests.length === 1 ? "" : "s"}
              </div>
              <ul className="space-y-1 text-muted-foreground">
                {pendingRequests.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <strong className="text-foreground">{r.user_name || r.user_email || "Unknown"}</strong>
                    {" → "}{r.requested_area}
                    {r.message ? <span className="opacity-75"> · "{r.message.slice(0, 80)}{r.message.length > 80 ? "…" : ""}"</span> : null}
                  </li>
                ))}
                {pendingRequests.length > 5 && (
                  <li className="opacity-75">+ {pendingRequests.length - 5} more</li>
                )}
              </ul>
              <Link to="/admin/users" className="inline-block mt-2 text-primary hover:underline text-xs font-bold uppercase tracking-wide">
                Review → User Management
              </Link>
            </div>
          </div>
        )}

        <h1 className="text-2xl font-bold text-foreground mb-2">Choose a workspace</h1>
        <p className="text-sm text-muted-foreground mb-8">
          You have access to the workspaces below based on your roles ({roles.length ? roles.join(", ") : "none yet"}).
          Locked areas can be requested.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ADMIN_AREAS.map((t) => {
            const allowed = hasAreaAccess(t, roles);
            const to = allowed ? t.to : `/admin/request-access?area=${t.key}`;
            // Read-only intersect: user is "allowed" only because of viewer/executive.
            // i.e., none of the area's editor roles are present.
            const editorRoles = t.roles.filter((r) => !READ_ONLY_ROLES.has(r));
            const hasEditorRole = editorRoles.some((r) => roles.includes(r));
            const readOnly = allowed && !hasEditorRole;
            return (
              <div
                key={t.key}
                className={`group block border border-border bg-background p-6 hover:border-primary transition-colors relative ${
                  !allowed ? "opacity-75" : ""
                }`}
              >
                <Link to={to} className="block">
                  <t.icon className="h-6 w-6 text-primary mb-3" />
                  <h3 className="font-bold text-foreground mb-1 flex items-center gap-2">
                    {t.title}
                    {!allowed && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                    {readOnly && (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5">
                        Read-only
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {allowed ? t.desc : "You don't have access — click to request."}
                  </p>
                </Link>
                {readOnly && (
                  <Link
                    to={`/admin/request-access?area=${t.key}&level=edit`}
                    className="mt-3 inline-block text-xs text-primary hover:underline font-bold uppercase tracking-wide"
                  >
                    Request full access →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-8">
          <AbVariantTile />
        </div>
        <div className="mt-4">
          <Link
            to="/admin/ab-results"
            className="group block border border-border bg-background p-6 hover:border-primary transition-colors"
          >
            <BarChart3 className="h-6 w-6 text-primary mb-3" />
            <h3 className="font-bold text-foreground mb-1">A/B Results Dashboard</h3>
            <p className="text-sm text-muted-foreground">
              Live conversion comparison between the legacy WordPress site and the Lovable
              rebuild — no GA4 setup required.
            </p>
          </Link>
        </div>

        {roles.some((r) => ADMIN_ROLES.has(r)) && (
          <div className="mt-4">
            <Link
              to="/admin/users"
              className="group block border border-border bg-background p-6 hover:border-primary transition-colors"
            >
              <Users className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-bold text-foreground mb-1">Staff Users</h3>
              <p className="text-sm text-muted-foreground">
                Approve signups, invite team members, assign roles, and review pending
                access requests across CRM, CMS, Kennel, and Finance.
              </p>
            </Link>
          </div>
        )}

        {roles.some((r) => ADMIN_ROLES.has(r)) && (
          <div className="mt-4">
            <Link
              to="/admin/customers"
              className="group block border border-border bg-background p-6 hover:border-primary transition-colors"
            >
              <UserCircle className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-bold text-foreground mb-1">Customers</h3>
              <p className="text-sm text-muted-foreground">
                Mirror of the Vinoshipper customer list. Search, segment by club status and state,
                and refresh on demand. Foundation for Subscribe &amp; Save, AI wine-club curation,
                and ad audience exports.
              </p>
            </Link>
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6">
          {currentUser && (
            <FeatureRequestBox
              userId={currentUser.id}
              userEmail={currentUser.email}
              userName={currentUser.name}
            />
          )}
          {roles.some((r) => ADMIN_ROLES.has(r)) && <FeatureRequestInbox />}
        </div>
      </main>
    </div>
  );
};

export default AdminPortalPage;