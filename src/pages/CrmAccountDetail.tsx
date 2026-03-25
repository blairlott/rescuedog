import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, Phone, Mail, Globe, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSalesAccount, useAccountActivities, useAddActivity, useUpsertAccount } from "@/hooks/useSalesAccounts";
import { useState } from "react";
import { toast } from "sonner";
import { AccountFormDialog } from "@/components/crm/AccountFormDialog";
import { getStaleness, getStalenessLabel, getStalenessColor } from "@/lib/staleness";

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
                  id: account.id,
                  account_name: account.account_name,
                  last_order_date: today,
                } as any);
                await addActivity.mutateAsync({
                  account_id: account.id,
                  activity_type: 'order',
                  description: `Order marked on ${today}`,
                });
                toast.success('Marked as ordered today');
              } catch (err: any) {
                toast.error(err.message);
              }
            }}
          >
            <ShoppingCart className="h-4 w-4 mr-1" /> Mark Ordered
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
        </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Details */}
        <div className="bg-card border border-border p-4 space-y-3">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-brand">Details</h3>
          {account.buyer_name && <p className="text-sm"><span className="text-muted-foreground">Buyer:</span> {account.buyer_name} {account.buyer_title && `(${account.buyer_title})`}</p>}
          {account.rep_name && <p className="text-sm"><span className="text-muted-foreground">Rep:</span> {account.rep_name}</p>}
          {account.distributor && <p className="text-sm"><span className="text-muted-foreground">Distributor:</span> {account.distributor}</p>}
          {account.distributor_rep && <p className="text-sm"><span className="text-muted-foreground">Dist. Rep:</span> {account.distributor_rep}</p>}
          {account.sales_order && <p className="text-sm"><span className="text-muted-foreground">Order:</span> {account.sales_order}</p>}
          {account.notes && <p className="text-sm"><span className="text-muted-foreground">Notes:</span> {account.notes}</p>}
        </div>

        {/* Contact */}
        <div className="bg-card border border-border p-4 space-y-3">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-brand">Contact</h3>
          {address && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{address}</a> : <span>{address}</span>}
            </div>
          )}
          {account.phone && <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><a href={`tel:${account.phone}`} className="hover:underline">{account.phone}</a></div>}
          {account.email && <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><a href={`mailto:${account.email}`} className="hover:underline">{account.email}</a></div>}
          {account.website && <div className="flex items-center gap-2 text-sm"><Globe className="h-4 w-4 text-muted-foreground" /><a href={account.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{account.website}</a></div>}
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
                  {new Date(a.created_at).toLocaleDateString()} · {a.activity_type}
                </p>
              </div>
            </div>
          ))}
          {activities.length === 0 && <p className="text-sm text-muted-foreground">No activities yet.</p>}
        </div>
      </div>

      <AccountFormDialog open={editOpen} onOpenChange={setEditOpen} account={account} />
    </div>
  );
}
