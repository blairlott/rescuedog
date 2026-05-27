import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DollarSign } from "lucide-react";
import { Seo } from "@/components/Seo";

export default function FinanceLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) navigate("/finance", { replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("must_change_password")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.must_change_password) {
          navigate("/admin/change-password?next=/finance", { replace: true });
          return;
        }
      }
      navigate("/finance");
    } catch (err: any) {
      toast.error(err.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Seo noindex title="Finance Login" />
    <div className="min-h-dvh bg-muted/30 grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-foreground text-background">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 bg-primary text-primary-foreground flex items-center justify-center">
            <DollarSign className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] uppercase tracking-brand opacity-70">Rescue Dog</div>
            <div className="font-bold">Finance Portal</div>
          </div>
        </div>
        <div className="space-y-4 max-w-md">
          <h2 className="text-3xl font-bold leading-tight">A single pane of glass for every dollar.</h2>
          <p className="text-sm opacity-80">QuickBooks, Vinoshipper, and the Command Center — pivots, charts, and saved views, all in one private workspace.</p>
        </div>
        <div className="text-xs opacity-60">© Rescue Dog Wines · Finance access by invitation only.</div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <DollarSign className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Finance Portal</h1>
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Sign in</h1>
            <p className="text-sm text-muted-foreground">Access your CFO dashboard.</p>
          </div>
          <form onSubmit={submit} className="space-y-4 bg-card border border-border p-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "…" : "Sign In"}
          </Button>
          <div className="text-right text-xs">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground underline"
              onClick={async () => {
                if (!email) { toast.error("Enter your email first"); return; }
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                if (error) toast.error(error.message); else toast.success("Reset email sent");
              }}
            >
              Forgot password?
            </button>
          </div>
          </form>
        </div>
      </div>
    </div>
    </>
  );
}