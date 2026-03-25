import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, Phone, Mail, Globe, Plus, ShoppingCart, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSalesAccount, useAccountActivities, useAddActivity, useUpsertAccount } from "@/hooks/useSalesAccounts";
import { useState } from "react";
import { AccountFormDialog } from "@/components/crm/AccountFormDialog";
import { toast } from "sonner";
import { getStaleness, getStalenessLabel, getStalenessColor } from "@/lib/staleness";
import { US_STATES } from "@/lib/usStates";

function EditableField({ label, value, onSave, type = "text" }: {
  label: string; value: string; onSave: (v: string) => void; type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div className="flex items-center gap-1 group">
        <span className="text-sm">{value || "—"}</span>
        <button onClick={() => { setDraft(value); setEditing(true); }} className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} type={type} className="h-7 text-sm w-full" autoFocus />
      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => { onSave(draft); setEditing(false); }}>
        <Check className="h-3 w-3 text-green-600" />
      </Button>
      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditing(false)}>
        <X className="h-3 w-3 text-destructive" />
      </Button>
    </div>
  );
}

function EditableStateSelect({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center gap-1 group">
        <span className="text-sm">{value || "—"}</span>
        <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => { onSave(v); setEditing(false); }}>
      <SelectTrigger className="h-7 text-sm w-[120px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {US_STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export default function CrmAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: account, isLoading } = useSalesAccount(id);
  const { data: activities = [] } = useAccountActivities(id);
  const addActivity = useAddActivity();
  const upsertAccount = useUpsertAccount();
  const [activityText, setActivityText] = useState("");
  const [activityType, setActivityType] = useState("note");
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!account) return <div className="p-6 text-muted-foreground">Account not found</div>;

  const address = [account.street_address, account.city, account.state, account.zip].filter(Boolean).join(", ");
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;

  const saveField = (field: string, value: string | null) => {
    upsertAccount.mutate(
      { id: account.id, account_name: account.account_name, [field]: value || null } as any,
      { onSuccess: () => toast.success(`${field.replace(/_/g, " ")} updated`) }
    );
  };

  const handleAddActivity = async () => {
    if (!activityText.trim() || !id) return;
    try {
      await addActivity.mutateAsync({ account_id: id, activity_type: activityType, description: activityText });
      setActivityText("");
      toast.success("Activity added");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const activityIcons: Record<string, string> = { note: "📝", visit: "🏪", call: "📞", email: "📧", order: "📦" };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Link to="/crm" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Accounts
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{account.account_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{account.premise_type === "on" ? "On Premise" : "Off Premise"}</Badge>
            <Badge className="capitalize">{account.status}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const today = new Date().toISOString().split('T')[0];
              try {
                await upsertAccount.mutateAsync({
                  id: account.id, account_name: account.account_name, last_order_date: today,
                } as any);
                await addActivity.mutateAsync({
                  account_id: account.id, activity_type: 'order', description: `Order marked on ${today}`,
                });
                toast.success('Marked as ordered today');
              } catch (err: any) {
                toast.error(err.message);
              }
            }}
          >
            <ShoppingCart className="h-4 w-4 mr-1" /> Mark Ordered
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Details */}
        <div className="bg-card border border-border p-4 space-y-3">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-brand">Details</h3>
          <div className="space-y-2">
            <div>
              <span className="text-xs text-muted-foreground">Buyer</span>
              <EditableField label="Buyer" value={account.buyer_name || ""} onSave={(v) => saveField("buyer_name", v)} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Buyer Title</span>
              <EditableField label="Buyer Title" value={account.buyer_title || ""} onSave={(v) => saveField("buyer_title", v)} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Rep</span>
              <EditableField label="Rep" value={account.rep_name || ""} onSave={(v) => saveField("rep_name", v)} />
            </div>
            <p className="text-sm">
              <span className="text-muted-foreground">Last Order:</span>{' '}
              {(() => {
                const level = getStaleness(account.last_order_date);
                return (
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${getStalenessColor(level)}`}>
                    {account.last_order_date
                      ? `${new Date(account.last_order_date).toLocaleDateString()} (${getStalenessLabel(level)})`
                      : getStalenessLabel(level)}
                  </span>
                );
              })()}
            </p>
            <div>
              <span className="text-xs text-muted-foreground">Distributor</span>
              <EditableField label="Distributor" value={account.distributor || ""} onSave={(v) => saveField("distributor", v)} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Dist. Rep</span>
              <EditableField label="Dist. Rep" value={account.distributor_rep || ""} onSave={(v) => saveField("distributor_rep", v)} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Sales Order</span>
              <EditableField label="Sales Order" value={account.sales_order || ""} onSave={(v) => saveField("sales_order", v)} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Notes</span>
              <EditableField label="Notes" value={account.notes || ""} onSave={(v) => saveField("notes", v)} />
            </div>
          </div>
        </div>

        {/* Contact & Address */}
        <div className="bg-card border border-border p-4 space-y-3">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-brand">Contact & Address</h3>
          <div className="space-y-2">
            <div>
              <span className="text-xs text-muted-foreground">Street Address</span>
              <EditableField label="Street" value={account.street_address || ""} onSave={(v) => saveField("street_address", v)} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">City</span>
              <EditableField label="City" value={account.city || ""} onSave={(v) => saveField("city", v)} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">State</span>
              <EditableStateSelect value={account.state || ""} onSave={(v) => saveField("state", v)} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">ZIP</span>
              <EditableField label="ZIP" value={account.zip || ""} onSave={(v) => saveField("zip", v)} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Phone</span>
              <EditableField label="Phone" value={account.phone || ""} onSave={(v) => saveField("phone", v)} type="tel" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Email</span>
              <EditableField label="Email" value={account.email || ""} onSave={(v) => saveField("email", v)} type="email" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Website</span>
              <EditableField label="Website" value={account.website || ""} onSave={(v) => saveField("website", v)} type="url" />
            </div>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2">
                <MapPin className="h-3 w-3" /> View on Google Maps
              </a>
            )}
            {account.latitude && account.longitude && (
              <p className="text-xs text-muted-foreground">
                Coords: {account.latitude.toFixed(5)}, {account.longitude.toFixed(5)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="space-y-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-brand">Activity Timeline</h3>
        <div className="bg-card border border-border p-4 space-y-3">
          <div className="flex gap-2">
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="visit">Visit</SelectItem>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="order">Order</SelectItem>
              </SelectContent>
            </Select>
            <Textarea value={activityText} onChange={(e) => setActivityText(e.target.value)} placeholder="Add an activity..." className="flex-1" rows={1} />
            <Button onClick={handleAddActivity} disabled={!activityText.trim() || addActivity.isPending} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {activities.map((a) => (
            <div key={a.id} className="bg-card border border-border p-3 flex gap-3">
              <span className="text-lg">{activityIcons[a.activity_type || "note"] || "📝"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{a.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(a.created_at!).toLocaleDateString()} · {a.activity_type}
                </p>
              </div>
            </div>
          ))}
          {activities.length === 0 && <p className="text-sm text-muted-foreground">No activities yet.</p>}
        </div>
      </div>
    </div>
  );
}
