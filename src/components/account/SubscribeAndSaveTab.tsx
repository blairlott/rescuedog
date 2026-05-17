import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export const SubscribeAndSaveTab = ({ userId, vinoshipperLinked: _vinoshipperLinked }: { userId: string; vinoshipperLinked?: boolean }) => {
  const queryClient = useQueryClient();

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["wine-subscriptions", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wine_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const action = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.functions.invoke("wine-subscription-action", { body: payload });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars: any) => {
      const verb = vars.action === "skip" ? "Next shipment skipped" : vars.action === "cancel" ? "Subscription cancelled" : "Subscription updated";
      toast.success(verb);
      queryClient.invalidateQueries({ queryKey: ["wine-subscriptions"] });
    },
    onError: (e: any) => toast.error(e.message || "Could not complete request"),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  if (subs.length === 0) {
    return (
      <div className="text-center py-12 border border-border">
        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="font-bold text-foreground mb-2">No active subscriptions</h3>
        <p className="text-sm text-muted-foreground mb-4">Save 10% on any wine when you subscribe to recurring shipments.</p>
        <Button asChild><Link to="/wines">Browse Wines</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {subs.map((s: any) => (
        <div key={s.id} className="border border-border p-4 flex gap-4">
          <div className="w-16 h-20 bg-secondary flex-shrink-0 overflow-hidden">
            {s.product_image_url && <img src={s.product_image_url} alt={s.product_title} className="w-full h-full object-cover" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-foreground">{s.product_title}</h3>
                <p className="text-xs text-muted-foreground">SKU {s.sku} · {s.discount_percent}% subscriber discount</p>
              </div>
              <span className={`text-xs font-bold uppercase px-2 py-0.5 ${s.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{s.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Select value={String(s.quantity)} onValueChange={(v) => action.mutate({ action: "update", subscription_id: s.id, quantity: Number(v) })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 2, 3, 6, 12].map((n) => <SelectItem key={n} value={String(n)}>{n} bottle{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={s.cadence} onValueChange={(v) => action.mutate({ action: "update", subscription_id: s.id, cadence: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Every month</SelectItem>
                  <SelectItem value="quarterly">Every 3 months</SelectItem>
                  <SelectItem value="biannual">Every 6 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {s.next_ship_date && <p className="text-xs text-muted-foreground mt-2">Next shipment: {new Date(s.next_ship_date).toLocaleDateString()}</p>}
            {s.status === "active" && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => action.mutate({ action: "skip", subscription_id: s.id })}>
                  <SkipForward className="w-3 h-3" />Skip Next
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => { if (confirm("Cancel this subscription?")) action.mutate({ action: "cancel", subscription_id: s.id }); }}>
                  <X className="w-3 h-3" />Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};