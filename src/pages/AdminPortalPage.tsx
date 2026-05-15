import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, PenLine, Users, Wine, Truck, LogOut } from "lucide-react";

type RoleRow = { role: string };

const TILES = [
  { key: "cms", to: "/cms", title: "Content (CMS)", desc: "Edit marketing copy, partners, branding.", icon: PenLine,
    roles: ["owner", "admin", "cms_editor"] },
  { key: "crm", to: "/crm", title: "Sales (CRM)", desc: "Accounts, routes, ambassadors, compliance.", icon: Users,
    roles: ["owner", "admin", "national_manager", "regional_manager", "state_manager", "brand_ambassador", "ambassador_manager", "crm_user"] },
  { key: "club", to: "/club/admin", title: "Wine Club", desc: "Members, shipments, curations.", icon: Wine,
    roles: ["owner", "admin", "wine_club_manager"] },
  { key: "dropship", to: "/crm/dropship", title: "Dropship", desc: "Partners, orders, payouts.", icon: Truck,
    roles: ["owner", "admin", "dropship_manager"] },
];

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
    if (userRoles.length === 0) {
      await supabase.auth.signOut();
      toast({ title: "Access denied", description: "Your account has no admin roles assigned.", variant: "destructive" });
      setLoading(false);
      return;
    }
    setRoles(userRoles);
    setLoading(false);
    toast({ title: "Welcome back" });
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setRoles(null);
    navigate("/admin");
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
  const visibleTiles = TILES.filter((t) => t.roles.some((r) => roles.includes(r)));

  return (
    <div className="min-h-screen bg-secondary">
      <header className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold uppercase tracking-brand text-sm">Admin Portal</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-2xl font-bold text-foreground mb-2">Choose a workspace</h1>
        <p className="text-sm text-muted-foreground mb-8">
          You have access to the workspaces below based on your roles ({roles.join(", ")}).
        </p>
        {visibleTiles.length === 0 ? (
          <div className="border border-border bg-background p-8 text-center text-sm text-muted-foreground">
            Your account has no admin roles assigned. Ask an owner to grant access.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleTiles.map((t) => (
              <Link
                key={t.key}
                to={t.to}
                className="group block border border-border bg-background p-6 hover:border-primary transition-colors"
              >
                <t.icon className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-bold text-foreground mb-1">{t.title}</h3>
                <p className="text-sm text-muted-foreground">{t.desc}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPortalPage;