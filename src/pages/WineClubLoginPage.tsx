import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wine } from "lucide-react";

export default function WineClubLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Check if user has wine club manager access
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Auth failed");

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const hasAccess = (roles || []).some((r: any) =>
        ["owner", "admin", "wine_club_manager"].includes(r.role)
      );

      if (!hasAccess) {
        await supabase.auth.signOut();
        throw new Error("You don't have wine club manager access. Contact your administrator.");
      }

      navigate("/club/admin");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <Wine className="h-12 w-12 text-primary mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Wine Club Manager</h1>
          <p className="text-muted-foreground text-sm">
            Sign in to manage wine club memberships and shipments.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border p-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="manager@rescuedogwines.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full uppercase tracking-brand text-sm font-bold" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
          <div className="text-right">
            <button
              type="button"
              onClick={async () => {
                if (!email) {
                  toast.error("Enter your email address first.");
                  return;
                }
                try {
                  const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/club/reset-password`,
                  });
                  if (error) throw error;
                  toast.success("Check your email for a password reset link.");
                } catch (err: any) {
                  toast.error(err.message);
                }
              }}
              className="text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
            >
              Forgot password?
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Access is by invitation only. Contact your administrator if you need an account.
        </p>
      </div>
    </div>
  );
}
