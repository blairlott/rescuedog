import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Lock, ArrowLeft, CheckCircle2 } from "lucide-react";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { findArea, ADMIN_AREAS, REQUESTABLE_ROLES_BY_AREA } from "@/lib/adminAreas";

export default function RequestAccessPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const areaKey = params.get("area") || "";
  const requestedLevel = (params.get("level") === "edit" ? "edit" : "access") as "access" | "edit";
  const area = findArea(areaKey);

  const [roles, setRoles] = useState<string[]>([]);
  const [user, setUser] = useState<{ id: string; email?: string | null; full_name?: string | null } | null>(null);
  const [message, setMessage] = useState("");
  const [requestedRole, setRequestedRole] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [existingRequestId, setExistingRequestId] = useState<string | null>(null);

  const roleOptions = area ? REQUESTABLE_ROLES_BY_AREA[area.key] || [] : [];

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
    if (!requestedRole) {
      toast.error("Pick the role that best fits your job.");
      return;
    }
    setSubmitting(true);
    const composedMessage = [
      requestedLevel === "edit" ? "[Elevated edit/admin access requested]" : null,
      message.trim() || null,
    ].filter(Boolean).join("\n\n");
    const { data, error } = await supabase
      .from("access_requests")
      .insert({
        user_id: user.id,
        user_email: user.email ?? null,
        user_name: user.full_name ?? null,
        requested_area: area.key,
        requested_role: requestedRole,
        message: composedMessage || null,
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

    // Fire-and-forget admin email + in-app notification. Test-mode email
    // routing (see mem/features/email-test-mode) sends this only to Blair + Lindy.
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          template_name: "access-request-admin-notification",
          to: "blair.lott@rescuedogwines.com",
          purpose: "transactional",
          idempotency_key: `access-req-${data.id}`,
          template_data: {
            userName: user.full_name || user.email,
            userEmail: user.email,
            currentRoles: roles.length ? roles.join(", ") : "(none)",
            requestedArea: area.title,
              requestedRole: roleOptions.find((r) => r.value === requestedRole)?.label || requestedRole,
            message: message.trim() || undefined,
            reviewUrl: `${window.location.origin}/admin`,
          },
        },
      });
    } catch (err) {
      // Non-blocking — the row is already in access_requests so the admin
      // banner will still surface the request on next login.
      console.warn("access-request email notify failed", err);
    }
  };

  return (
    <div className="min-h-dvh bg-secondary">
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
                {requestedLevel === "edit"
                  ? <>You have read-only access to <strong>{area.title}</strong>. Request full edit / admin access and Blair will review it.</>
                  : <>You don't currently have access to <strong>{area.title}</strong>. Submit a request and an admin will review it.</>}
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="role">Which role fits your job?</Label>
                  <Select value={requestedRole} onValueChange={setRequestedRole}>
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Pick the role you need…" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Don't worry about picking the wrong one — an admin will confirm or adjust before granting access.
                  </p>
                </div>
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
                  {submitting
                    ? "Submitting…"
                    : requestedLevel === "edit"
                      ? `Request full access to ${area.title}`
                      : `Request access to ${area.title}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}