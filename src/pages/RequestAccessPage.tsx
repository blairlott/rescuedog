import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, ArrowLeft, CheckCircle2 } from "lucide-react";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { findArea, ADMIN_AREAS } from "@/lib/adminAreas";

export default function RequestAccessPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const areaKey = params.get("area") || "";
  const area = findArea(areaKey);

  const [roles, setRoles] = useState<string[]>([]);
  const [user, setUser] = useState<{ id: string; email?: string | null; full_name?: string | null } | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [existingRequestId, setExistingRequestId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) {
        navigate("/admin");
        return;
      }
      const [{ data: roleRows }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.id),
        supabase.from("profiles").select("email, full_name").eq("id", u.id).maybeSingle(),
      ]);
      setRoles((roleRows || []).map((r: any) => r.role));
      setUser({ id: u.id, email: profile?.email ?? u.email, full_name: profile?.full_name });

      if (areaKey) {
        const { data: existing } = await supabase
          .from("access_requests")
          .select("id")
          .eq("user_id", u.id)
          .eq("requested_area", areaKey)
          .eq("status", "pending")
          .maybeSingle();
        if (existing) setExistingRequestId(existing.id);
      }
    })();
  }, [areaKey, navigate]);

  const submit = async () => {
    if (!user || !area) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from("access_requests")
      .insert({
        user_id: user.id,
        user_email: user.email ?? null,
        user_name: user.full_name ?? null,
        requested_area: area.key,
        message: message.trim() || null,
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setExistingRequestId(data.id);
    toast.success("Access request submitted");
  };

  return (
    <div className="min-h-screen bg-secondary">
      <AdminTopNav roles={roles} />
      <main className="container mx-auto px-4 py-12 max-w-xl">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Admin Portal
        </Link>

        <div className="bg-background border border-border p-8">
          <div className="flex items-center gap-3 mb-2">
            <Lock className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Request Access</h1>
          </div>

          {!area ? (
            <div>
              <p className="text-sm text-muted-foreground mb-4">Choose which area you need access to:</p>
              <ul className="space-y-2">
                {ADMIN_AREAS.map((a) => (
                  <li key={a.key}>
                    <Link to={`/admin/request-access?area=${a.key}`} className="text-primary hover:underline">
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : existingRequestId ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-3" />
              <p className="font-medium text-foreground">Request pending</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your request for <strong>{area.title}</strong> is awaiting review by an admin.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                You don't currently have access to <strong>{area.title}</strong>. Submit a request and an admin will review it.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="msg">Why do you need access? (optional)</Label>
                  <Textarea
                    id="msg"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Briefly explain your role and why you need this area…"
                    rows={4}
                  />
                </div>
                <Button onClick={submit} disabled={submitting} className="w-full">
                  {submitting ? "Submitting…" : `Request access to ${area.title}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}