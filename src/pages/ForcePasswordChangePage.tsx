import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export default function ForcePasswordChangePage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin", { replace: true });
        return;
      }
      setReady(true);
    })();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      toast.error("Password must be at least 10 characters.");
      return;
    }
    if (password === "ChangeMeRDW!") {
      toast.error("Please choose a new password — not the temporary one.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ must_change_password: false })
          .eq("id", user.id);
      }
      toast.success("Password updated. Welcome!");
      navigate("/admin", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Could not update password.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return <div className="min-h-dvh flex items-center justify-center bg-secondary text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-md">
        <div className="bg-background border border-border p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-4">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Set a new password</h1>
            <p className="text-sm text-muted-foreground mt-2">
              For security, please replace your temporary password before continuing.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="new-pw">New password</Label>
              <Input id="new-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground mt-1">Minimum 10 characters.</p>
            </div>
            <div>
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <Input id="confirm-pw" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating…" : "Update password & continue"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}