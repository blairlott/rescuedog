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
  Download,
  ChefHat,
} from "lucide-react";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CART_DEFAULTS } from "@/hooks/useCartSettings";
import { GIFT_WRAP_DEFAULTS } from "@/hooks/useGiftWrapSettings";
import { Switch } from "@/components/ui/switch";
import { WordpressImportPanel } from "@/components/cms/WordpressImportPanel";
import { ContentLibraryPanel } from "@/components/cms/ContentLibraryPanel";
import { PairingsPanel } from "@/components/cms/PairingsPanel";
import { MerchImagesPanel } from "@/components/cms/MerchImagesPanel";
import { Image as ImageIcon, Heart } from "lucide-react";
import { RescueSpotlightPanel } from "@/components/cms/RescueSpotlightPanel";
import { IntegrationsPanel } from "@/components/cms/IntegrationsPanel";
import { Plug } from "lucide-react";
import { TeamInviteDialog } from "@/components/team/TeamInviteDialog";
import { TeamInvitationsList } from "@/components/team/TeamInvitationsList";
import { useUserRole } from "@/hooks/useUserRole";

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

// ─── Cart Settings Panel ─────────────────────────────────────
function CartSettingsPanel() {
  const { content, upsert } = useCmsContent("cart_settings");
  const [values, setValues] = useState({
    free_shipping_bottles: "",
    half_case_count: "",
    full_case_count: "",
    full_case_discount: "",
    club_discount: "",
  });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && content) {
      setValues({
        free_shipping_bottles: getCmsValue(content, "thresholds", "free_shipping_bottles", String(CART_DEFAULTS.freeShippingBottleCount)),
        half_case_count: getCmsValue(content, "thresholds", "half_case_count", String(CART_DEFAULTS.halfCaseCount)),
        full_case_count: getCmsValue(content, "thresholds", "full_case_count", String(CART_DEFAULTS.fullCaseCount)),
        full_case_discount: getCmsValue(content, "thresholds", "full_case_discount", String(CART_DEFAULTS.fullCaseDiscount)),
        club_discount: getCmsValue(content, "thresholds", "club_discount", String(CART_DEFAULTS.clubDiscount)),
      });
      setInitialized(true);
    }
  }, [content, initialized]);

  const handleSave = () => {
    upsert.mutate({
      sectionKey: "thresholds",
      content: values,
    });
  };

  const fields = [
    { key: "free_shipping_bottles", label: "Shipping Included Bottle Count", description: "Customers must add at least this many bottles to qualify for included shipping" },
    { key: "half_case_count", label: "Half-Case Bottle Count", description: "Number of bottles in a half-case (used for upsell messaging)" },
    { key: "full_case_count", label: "Full-Case Bottle Count", description: "Number of bottles in a full case" },
    { key: "full_case_discount", label: "Full-Case Discount (%)", description: "Percentage discount shown when customer reaches a full case" },
    { key: "club_discount", label: "Wine Club Discount (%)", description: "Percentage discount shown in Wine Club savings callout" },
  ];

  return (
    <div className="bg-background border border-border">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-bold text-foreground">Cart & Shipping Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure marketing thresholds for the shopping cart
        </p>
      </div>
      <div className="p-6 space-y-6">
        {fields.map(field => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`cart-${field.key}`} className="text-sm font-medium">{field.label}</Label>
            <Input
              id={`cart-${field.key}`}
              type="number"
              min="0"
              value={values[field.key as keyof typeof values]}
              onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">{field.description}</p>
          </div>
        ))}
        <div className="pt-4 border-t border-border">
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</>
            ) : (
              "Save Settings"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Gift Wrap Settings Panel ────────────────────────────────
function GiftWrapSettingsPanel() {
  const { content, upsert } = useCmsContent("cart_settings");
  const [enabled, setEnabled] = useState<boolean>(GIFT_WRAP_DEFAULTS.enabled);
  const [feeDollars, setFeeDollars] = useState<string>(String(GIFT_WRAP_DEFAULTS.feeCents / 100));
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && content) {
      const enabledRaw = getCmsValue(content, "gift_wrap", "enabled", String(GIFT_WRAP_DEFAULTS.enabled));
      const feeRaw = getCmsValue(content, "gift_wrap", "fee_cents", String(GIFT_WRAP_DEFAULTS.feeCents));
      setEnabled(enabledRaw === "true" || (enabledRaw as any) === true);
      setFeeDollars((Number(feeRaw) / 100).toFixed(2));
      setInitialized(true);
    }
  }, [content, initialized]);

  const handleSave = () => {
    const cents = Math.max(0, Math.round(parseFloat(feeDollars || "0") * 100));
    upsert.mutate({
      sectionKey: "gift_wrap",
      content: { enabled: String(enabled), fee_cents: String(cents) },
    });
  };

  return (
    <div className="bg-background border border-border mt-6">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-bold text-foreground">Gift Wrapping</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Toggle the gift wrap add-on in the cart and set its price. Off by
          default — turn on once fulfillment is ready.
        </p>
      </div>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">Offer gift wrapping</Label>
            <p className="text-xs text-muted-foreground mt-1">
              When off, the gift-wrap option is hidden from the cart's Gift mode.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gift-wrap-fee" className="text-sm font-medium">Gift Wrap Fee (USD)</Label>
          <Input
            id="gift-wrap-fee"
            type="number"
            min="0"
            step="0.01"
            value={feeDollars}
            onChange={(e) => setFeeDollars(e.target.value)}
            className="max-w-xs"
            disabled={!enabled}
          />
          <p className="text-xs text-muted-foreground">Charged once per order when the customer opts in.</p>
        </div>
        <div className="pt-4 border-t border-border">
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</>
            ) : (
              "Save Gift Wrap Settings"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────
const CmsDashboard = () => {
  const { isCmsEditor, loading, logout } = useCmsAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const { data: roleInfo } = useUserRole();
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

  // CMS invites are handled by the shared <TeamInviteDialog />

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
              onClick={() => navigate("/crm")}
              className="gap-1 text-muted-foreground"
            >
              Sales CRM
            </Button>
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

      <div className="border-b border-border bg-muted/40">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Quick links:</span>
          <a href="/cms/experiments" className="text-primary hover:underline">Experiments &amp; Personalization →</a>
        </div>
      </div>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Tabs defaultValue="content">
          <TabsList className="mb-6">
            <TabsTrigger value="content" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Content
            </TabsTrigger>
            <TabsTrigger value="library" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Blog & Events
            </TabsTrigger>
            <TabsTrigger value="pairings" className="gap-1.5">
              <ChefHat className="h-3.5 w-3.5" /> Pairings
            </TabsTrigger>
            <TabsTrigger value="merch-images" className="gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Merch Images
            </TabsTrigger>
            <TabsTrigger value="rescues" className="gap-1.5">
              <Heart className="h-3.5 w-3.5" /> Rescues
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Users
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Settings
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Import
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5">
              <Plug className="h-3.5 w-3.5" /> Integrations
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

          {/* ── Library Tab (blog/events/pages) ───────────── */}
          <TabsContent value="library">
            <ContentLibraryPanel />
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

            <div className="bg-background border border-border mt-6 p-6">
              <TeamInvitationsList surface="cms" />
            </div>
          </TabsContent>

          {/* ── Settings Tab ──────────────────────────────── */}
          <TabsContent value="settings">
            <CartSettingsPanel />
            <GiftWrapSettingsPanel />
          </TabsContent>

          {/* ── Import Tab ────────────────────────────────── */}
          <TabsContent value="import">
            <WordpressImportPanel />
          </TabsContent>

          {/* ── Pairings Tab ──────────────────────────────── */}
          <TabsContent value="pairings">
            <PairingsPanel />
          </TabsContent>

          <TabsContent value="merch-images">
            <MerchImagesPanel />
          </TabsContent>

          <TabsContent value="rescues">
            <RescueSpotlightPanel />
          </TabsContent>

          <TabsContent value="integrations">
            <IntegrationsPanel />
          </TabsContent>
        </Tabs>
      </main>

      {/* ── Invite Dialog ─────────────────────────────────── */}
      <TeamInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        defaultRoles={["cms_editor"]}
        isOwner={!!roleInfo?.isOwner}
        title="Invite a CMS team member"
        surface="cms"
        onInvited={() => {
          queryClient.invalidateQueries({ queryKey: ["cms-users"] });
          queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
        }}
      />

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
