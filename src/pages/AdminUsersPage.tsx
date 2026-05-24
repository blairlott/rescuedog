import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import CrmAdminPage from "@/pages/CrmAdminPage";

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user) {
        navigate("/admin", { replace: true });
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
      const userRoles = ((data as any[]) || []).map((r) => r.role as string);
      if (!userRoles.some((r) => r === "owner" || r === "admin")) {
        navigate("/admin", { replace: true });
        return;
      }
      setRoles(userRoles);
      setChecking(false);
    })();
    return () => { mounted = false; };
  }, [navigate]);

  if (checking || !roles) {
    return <div className="min-h-dvh flex items-center justify-center bg-secondary text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-dvh bg-secondary">
      <AdminTopNav roles={roles} />
      <main className="container mx-auto max-w-6xl">
        <CrmAdminPage />
      </main>
    </div>
  );
}
