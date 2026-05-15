import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, ArrowLeft, ArrowRight, Check, FileText, ShieldCheck, Shield, Globe, Map, MapPin, UserCog, Heart, Wine, Truck, Users } from "lucide-react";

type Role =
  | "owner" | "admin" | "cms_editor" | "crm_user"
  | "national_manager" | "regional_manager" | "state_manager"
  | "brand_ambassador" | "ambassador_manager"
  | "wine_club_manager" | "dropship_manager";

const ROLE_GROUPS: { group: string; roles: { value: Role; label: string; desc: string; icon: any }[] }[] = [
  {
    group: "Leadership",
    roles: [
      { value: "owner", label: "Owner", desc: "Full control, including billing & owner assignment", icon: ShieldCheck },
      { value: "admin", label: "Admin", desc: "Manage users, settings, and all sections", icon: Shield },
    ],
  },
  {
    group: "CMS — Content & Marketing",
    roles: [
      { value: "cms_editor", label: "CMS Editor", desc: "Edit marketing copy, rescue partners, pairings, integrations", icon: FileText },
    ],
  },
  {
    group: "CRM — Sales Team",
    roles: [
      { value: "crm_user", label: "CRM User", desc: "Read-only CRM access — view accounts, maps, routes", icon: Users },
      { value: "brand_ambassador", label: "Sales Rep / Brand Ambassador", desc: "Manage own accounts, log visits & orders", icon: UserCog },
      { value: "state_manager", label: "State Manager", desc: "Oversee a single state", icon: MapPin },
      { value: "regional_manager", label: "Regional Manager", desc: "Oversee a multi-state region", icon: Map },
      { value: "national_manager", label: "National Manager", desc: "Oversee all states & regions", icon: Globe },
    ],
  },
  {
    group: "Specialized Areas",
    roles: [
      { value: "ambassador_manager", label: "Ambassador Manager", desc: "Approve & manage Rescue Ambassadors", icon: Heart },
      { value: "wine_club_manager", label: "Wine Club Manager", desc: "Manage members, shipments, curation", icon: Wine },
      { value: "dropship_manager", label: "Drop-Ship Manager", desc: "Manage merch fulfillment & marketplace partners", icon: Truck },
    ],
  },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited?: () => void;
  /** Pre-select roles relevant to the surface (e.g. ["cms_editor"] when opened from CMS) */
  defaultRoles?: Role[];
  /** Restrict the role list to a subset (e.g. only CMS roles) */
  allowedRoles?: Role[];
  /** Hide owner option for non-owners */
  isOwner?: boolean;
  title?: string;
}

export function TeamInviteDialog({
  open, onOpenChange, onInvited, defaultRoles = [], allowedRoles, isOwner = false,
  title = "Invite a team member",
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roles, setRoles] = useState<Role[]>(defaultRoles);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ recovery_link: string | null; already_existed: boolean; roles_added: string[]; roles_skipped: string[] } | null>(null);

  const reset = () => {
    setStep(1); setEmail(""); setFullName(""); setRoles(defaultRoles); setResult(null); setSubmitting(false);
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const toggleRole = (r: Role) => {
    setRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  };

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canNext = validEmail;
  const canSubmit = roles.length > 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: email.trim(),
          full_name: fullName.trim(),
          roles,
          redirect_to: `${window.location.origin}/reset-password`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult({
        recovery_link: data.recovery_link ?? null,
        already_existed: !!data.already_existed,
        roles_added: data.roles_added ?? [],
        roles_skipped: data.roles_skipped ?? [],
      });
      setStep(3);
      onInvited?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = () => {
    if (!result?.recovery_link) return;
    navigator.clipboard.writeText(result.recovery_link);
    toast.success("Setup link copied");
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step === 1 && "Step 1 of 2 — Who are you inviting?"}
            {step === 2 && "Step 2 of 2 — What can they access?"}
            {step === 3 && "Invite sent"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="ti-email">Email *</Label>
              <Input id="ti-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@rescuedogwines.com" autoFocus />
            </div>
            <div>
              <Label htmlFor="ti-name">Full name</Label>
              <Input id="ti-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={() => setStep(2)} disabled={!canNext} className="gap-1">
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 py-2">
            <p className="text-sm text-muted-foreground">
              Pick one or more roles. You can change these anytime in User Management.
            </p>
            {ROLE_GROUPS.map((g) => {
              const groupRoles = g.roles.filter((r) => {
                if (r.value === "owner" && !isOwner) return false;
                if (allowedRoles && !allowedRoles.includes(r.value)) return false;
                return true;
              });
              if (groupRoles.length === 0) return null;
              return (
                <div key={g.group}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{g.group}</h4>
                  <div className="space-y-1 border border-border">
                    {groupRoles.map((r) => {
                      const Icon = r.icon;
                      const checked = roles.includes(r.value);
                      return (
                        <label key={r.value} className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/40 border-b border-border last:border-b-0 ${checked ? "bg-primary/5" : ""}`}>
                          <Checkbox checked={checked} onCheckedChange={() => toggleRole(r.value)} className="mt-0.5" />
                          <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground">{r.label}</div>
                            <div className="text-xs text-muted-foreground">{r.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <DialogFooter className="flex-row sm:justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={submit} disabled={!canSubmit || submitting} className="gap-1">
                {submitting ? "Sending..." : <>Send invite <Check className="h-4 w-4" /></>}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && result && (
          <div className="space-y-4 py-2">
            <div className="border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">
                {result.already_existed
                  ? `Existing user updated: ${email}`
                  : `New user created: ${email}`}
              </p>
              {result.roles_added.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Roles added: {result.roles_added.map((r) => r.replace(/_/g, " ")).join(", ")}
                </p>
              )}
              {result.roles_skipped.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Already had: {result.roles_skipped.map((r) => r.replace(/_/g, " ")).join(", ")}
                </p>
              )}
            </div>
            {result.recovery_link ? (
              <div className="space-y-2">
                <Label>Password setup link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={result.recovery_link} className="font-mono text-xs" />
                  <Button variant="outline" size="sm" onClick={copyLink} className="gap-1">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Send this link to the user so they can set their password. Link expires in 1 hour.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                User can use the "Forgot password" link on the login page to set a password.
              </p>
            )}
            <DialogFooter className="flex-row sm:justify-between">
              <Button variant="outline" onClick={reset}>Invite another</Button>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
