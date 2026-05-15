import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock } from "lucide-react";
import { ADMIN_AREAS, hasAreaAccess } from "@/lib/adminAreas";
import { AdminTopNav } from "@/components/admin/AdminTopNav";

type RoleRow = { role: string };

const AdminPortalPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const loadRoles = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    return ((data as RoleRow[] | null) || []).map((r) => r.role);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) setRoles(await loadRoles(session.user.id));
      else setRoles(null);
      setChecking(false);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!mounted) return;
      if (session?.user) setRoles(await loadRoles(session.user.id));
      else setRoles(null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      toast({ title: "Login failed", description: error?.message || "Invalid credentials.", variant: "destructive" });
      setLoading(false);
      return;
    }
    const userRoles = await loadRoles(data.user.id);
    setRoles(userRoles);
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
    return <div className="min-h-screen flex items-center justify-center bg-secondary text-muted-foreground text-sm">Loading…</div>;
  }

  // Logged out → unified login
  if (!roles) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary px-4">
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
    <div className="min-h-screen bg-secondary">
      <AdminTopNav roles={roles} />
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-2xl font-bold text-foreground mb-2">Choose a workspace</h1>
        <p className="text-sm text-muted-foreground mb-8">
          You have access to the workspaces below based on your roles ({roles.length ? roles.join(", ") : "none yet"}).
          Locked areas can be requested.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ADMIN_AREAS.map((t) => {
            const allowed = hasAreaAccess(t, roles);
            const to = allowed ? t.to : `/admin/request-access?area=${t.key}`;
            return (
              <Link
                key={t.key}
                to={to}
                className={`group block border border-border bg-background p-6 hover:border-primary transition-colors relative ${
                  !allowed ? "opacity-75" : ""
                }`}
              >
                <t.icon className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-bold text-foreground mb-1 flex items-center gap-2">
                  {t.title}
                  {!allowed && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {allowed ? t.desc : "You don't have access — click to request."}
                </p>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default AdminPortalPage;