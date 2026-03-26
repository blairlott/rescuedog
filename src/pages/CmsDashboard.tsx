import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCmsAuth } from "@/hooks/useCmsAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PenLine,
  LogOut,
  Users,
  FileText,
  Plus,
  Trash2,
  Clock,
  ArrowLeft,
  Settings,
  Loader2,
} from "lucide-react";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CART_DEFAULTS } from "@/hooks/useCartSettings";

// ─── Types ───────────────────────────────────────────────────
type CmsUser = {
  user_id: string;
  role: string;
  email?: string;
  full_name?: string;
};

type CmsContentRow = {
  id: string;
  page: string;
  section_key: string;
  content: any;
  updated_at: string;
  updated_by: string | null;
};

// ─── Component ───────────────────────────────────────────────
const CmsDashboard = () => {
  const { isCmsEditor, loading, logout } = useCmsAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  // Redirect if not CMS editor
  useEffect(() => {
    if (!loading && !isCmsEditor) {
      navigate("/cms/login");
    }
  }, [loading, isCmsEditor, navigate]);

  // ─── Fetch CMS users (anyone with cms_editor, owner, or admin role) ──
  const { data: cmsUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["cms-users"],
    queryFn: async () => {
      // Get all user_roles where role is relevant for CMS
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (error) throw error;

      const cmsRoles = roles.filter(
        (r) => {
          const role = r.role as string;
          return role === "owner" || role === "admin" || role === "cms_editor";
        }
      );

      // Get profiles for those users
      const userIds = [...new Set(cmsRoles.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      const profileMap: Record<string, any> = {};
      profiles?.forEach((p) => {
        profileMap[p.id] = p;
      });

      return cmsRoles.map((r) => ({
        user_id: r.user_id,
        role: r.role,
        email: profileMap[r.user_id]?.email || "—",
        full_name: profileMap[r.user_id]?.full_name || "",
      })) as CmsUser[];
    },
    enabled: isCmsEditor,
  });

  // ─── Fetch all CMS content entries ─────────────────────────
  const { data: contentEntries = [], isLoading: contentLoading } = useQuery({
    queryKey: ["cms-content-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cms_content")
        .select("*")
        .order("page")
        .order("section_key");
      if (error) throw error;
      return data as CmsContentRow[];
    },
    enabled: isCmsEditor,
  });

  // ─── Invite CMS user ──────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("invite-cms-user", {
        body: { email: inviteEmail.trim(), full_name: inviteName.trim() },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: "CMS user invited", description: inviteEmail });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      queryClient.invalidateQueries({ queryKey: ["cms-users"] });
    } catch (err: any) {
      toast({
        title: "Error inviting user",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setInviting(false);
    }
  };

  // ─── Remove CMS role ──────────────────────────────────────
  const removeRole = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "cms_editor" as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-users"] });
      toast({ title: "CMS access removed" });
      setDeleteUserId(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ─── Delete CMS content entry ─────────────────────────────
  const [deleteContentId, setDeleteContentId] = useState<string | null>(null);
  const deleteContent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cms_content")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-content-all"] });
      toast({ title: "Content entry deleted" });
      setDeleteContentId(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isCmsEditor) return null;

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const contentFieldSummary = (content: any) => {
    if (!content || typeof content !== "object") return "—";
    const keys = Object.keys(content);
    if (keys.length === 0) return "Empty";
    return keys.join(", ");
  };

  return (
    <div className="min-h-screen bg-secondary">
      {/* Header */}
      <header className="bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-9 h-9 bg-primary/10 rounded-full">
              <PenLine className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">
                Content Manager
              </h1>
              <p className="text-xs text-muted-foreground">Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/about")}
              className="gap-1 text-muted-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to site
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="gap-1 text-muted-foreground"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Tabs defaultValue="content">
          <TabsList className="mb-6">
            <TabsTrigger value="content" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Content
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Users
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Settings
            </TabsTrigger>
          </TabsList>

          {/* ── Content Tab ───────────────────────────────── */}
          <TabsContent value="content">
            <div className="bg-background border border-border">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="font-bold text-foreground">Editable Content</h2>
                <p className="text-sm text-muted-foreground">
                  {contentEntries.length} entries
                </p>
              </div>
              {contentLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading...
                </div>
              ) : contentEntries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No content entries yet. Edit sections on the About or Mission
                  pages to create entries.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-secondary text-left">
                        <th className="py-3 px-4 text-sm font-bold text-foreground">
                          Page
                        </th>
                        <th className="py-3 px-4 text-sm font-bold text-foreground">
                          Section
                        </th>
                        <th className="py-3 px-4 text-sm font-bold text-foreground hidden md:table-cell">
                          Fields
                        </th>
                        <th className="py-3 px-4 text-sm font-bold text-foreground hidden lg:table-cell">
                          Last Updated
                        </th>
                        <th className="py-3 px-4 text-sm font-bold text-foreground w-16">
                          &nbsp;
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {contentEntries.map((entry, i) => (
                        <tr
                          key={entry.id}
                          className={
                            i % 2 === 0 ? "bg-background" : "bg-secondary/50"
                          }
                        >
                          <td className="py-3 px-4 text-sm font-medium text-foreground capitalize">
                            {entry.page}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {entry.section_key.replace(/_/g, " ")}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground hidden md:table-cell">
                            {contentFieldSummary(entry.content)}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground hidden lg:table-cell">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(entry.updated_at)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => setDeleteContentId(entry.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Users Tab ─────────────────────────────────── */}
          <TabsContent value="users">
            <div className="bg-background border border-border">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="font-bold text-foreground">
                  CMS Users
                </h2>
                <Button
                  size="sm"
                  onClick={() => setInviteOpen(true)}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" /> Invite Editor
                </Button>
              </div>
              {usersLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading...
                </div>
              ) : cmsUsers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No CMS users found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-secondary text-left">
                        <th className="py-3 px-4 text-sm font-bold text-foreground">
                          Name
                        </th>
                        <th className="py-3 px-4 text-sm font-bold text-foreground">
                          Email
                        </th>
                        <th className="py-3 px-4 text-sm font-bold text-foreground">
                          Role
                        </th>
                        <th className="py-3 px-4 text-sm font-bold text-foreground w-16">
                          &nbsp;
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmsUsers.map((u, i) => (
                        <tr
                          key={`${u.user_id}-${u.role}`}
                          className={
                            i % 2 === 0 ? "bg-background" : "bg-secondary/50"
                          }
                        >
                          <td className="py-3 px-4 text-sm text-foreground">
                            {u.full_name || "—"}
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {u.email}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <span className="inline-block bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full capitalize">
                              {u.role.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {u.role === "cms_editor" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => setDeleteUserId(u.user_id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-6 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Owners and Admins automatically have CMS access. Only the{" "}
                  <span className="font-medium">cms editor</span> role can be
                  removed here.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* ── Invite Dialog ─────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite CMS Editor</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleInvite();
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="inv-email">Email *</Label>
              <Input
                id="inv-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="inv-name">Full Name</Label>
              <Input
                id="inv-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? "Inviting..." : "Invite"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Remove User Confirm ───────────────────────────── */}
      <AlertDialog
        open={!!deleteUserId}
        onOpenChange={(open) => !open && setDeleteUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove CMS Access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the cms_editor role from this user. They will no
              longer be able to edit content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUserId && removeRole.mutate(deleteUserId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Content Confirm ────────────────────────── */}
      <AlertDialog
        open={!!deleteContentId}
        onOpenChange={(open) => !open && setDeleteContentId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Content Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this CMS content entry. The page will revert to
              its default text.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteContentId && deleteContent.mutate(deleteContentId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CmsDashboard;
