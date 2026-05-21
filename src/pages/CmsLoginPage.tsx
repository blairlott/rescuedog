import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PenLine } from "lucide-react";

const CmsLoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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
      toast({
        title: "Login failed",
        description: error?.message || "Unable to sign in with those credentials.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Check if user has CMS access (editors) OR read-only backend access (viewer/executive).
    const [{ data: isCmsEditor, error: roleError }, { data: roleRows }] = await Promise.all([
      supabase.rpc("is_cms_editor", { _user_id: data.user.id }),
      supabase.from("user_roles").select("role").eq("user_id", data.user.id),
    ]);
    const userRoles = ((roleRows as { role: string }[] | null) || []).map((r) => r.role);
    const hasReadOnly = userRoles.some((r) => r === "viewer" || r === "executive");

    if ((roleError || !isCmsEditor) && !hasReadOnly) {
      await supabase.auth.signOut();
      toast({
        title: "Access denied",
        description: roleError?.message || "Your account does not have CMS editing permissions.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    toast({
      title: "Welcome back!",
      description: hasReadOnly && !isCmsEditor
        ? "Read-only access enabled — you can view but not edit."
        : "You now have editing access.",
    });
    navigate("/cms");
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Enter your email first", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/crm/reset-password`,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email for a password reset link." });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-md">
        <div className="bg-background border border-border p-8 shadow-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-4">
              <PenLine className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Content Manager</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to edit website content</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="cms-email">Email</Label>
              <Input id="cms-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="cms-password">Password</Label>
              <Input id="cms-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <button
            type="button"
            onClick={handleForgotPassword}
            className="mt-4 text-sm text-primary hover:underline block mx-auto"
          >
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  );
};

export default CmsLoginPage;
