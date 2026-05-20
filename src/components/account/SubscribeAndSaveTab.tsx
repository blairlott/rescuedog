import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, SkipForward, X, Pause, Play, Calendar, Truck, History, ChevronDown, ChevronUp, Zap, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { isInternalEmail } from "@/lib/internalUsers";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

export const SubscribeAndSaveTab = ({ userId, vinoshipperLinked: _vinoshipperLinked }: { userId: string; vinoshipperLinked?: boolean }) => {
  const queryClient = useQueryClient();
  const { user } = useCustomerAuth();
  const internal = isInternalEmail(user?.email ?? null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");

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
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_, vars: any) => {
      const verbs: Record<string, string> = {
        skip: "Next shipment skipped",
        cancel: "Subscription cancelled",
        pause: "Subscription paused",
        resume: "Subscription resumed",
        reschedule: "Next ship date updated",
        ship_now: "Shipment queued — will process within 24h",
        swap: "Wine swapped",
        update: "Subscription updated",
      };
      const verb = verbs[vars.action] ?? "Subscription updated";
      toast.success(verb);
      queryClient.invalidateQueries({ queryKey: ["wine-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["wine-subscription-charges"] });
      setRescheduleId(null);
    },
    onError: (e: any) => toast.error(e.message || "Could not complete request"),
  });

  const chargeNow = useMutation({
    mutationFn: async (subscription_id: string) => {
      const { data, error } = await supabase.functions.invoke("wine-subscription-process", { body: { subscription_id } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const r = data?.results?.[0];
      if (r?.ok) toast.success(r.simulated ? "Charge simulated (live mode off)" : `Charged. Order ${r.order_id || "queued"}`);
      else toast.error(`Charge failed: ${r?.error ?? "unknown"}`);
      queryClient.invalidateQueries({ queryKey: ["wine-subscriptions"] });
    },
    onError: (e: any) => toast.error(e.message || "Could not run charge"),
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
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground border-l-2 border-primary pl-3">
        Manage your recurring wine shipments below. Pause anytime, skip a shipment, change your wine, or update the next ship date.
        To update the card on file, visit <a href="https://vinoshipper.com/account" target="_blank" rel="noopener" className="underline">vinoshipper.com/account</a>.
      </div>
      {subs.map((s: any) => (
        <SubCard
          key={s.id}
          sub={s}
          internal={internal}
          isPending={action.isPending}
          chargePending={chargeNow.isPending}
          expanded={expandedHistory === s.id}
          onToggleHistory={() => setExpandedHistory(expandedHistory === s.id ? null : s.id)}
          rescheduling={rescheduleId === s.id}
          rescheduleDate={rescheduleDate}
          onStartReschedule={() => {
            setRescheduleId(s.id);
            setRescheduleDate(s.next_ship_date ?? new Date().toISOString().slice(0, 10));
          }}
          onCancelReschedule={() => setRescheduleId(null)}
          setRescheduleDate={setRescheduleDate}
          onAction={(payload) => action.mutate({ ...payload, subscription_id: s.id })}
          onChargeNow={() => {
            if (confirm("Trigger a real recurring charge against the saved Vinoshipper card?")) chargeNow.mutate(s.id);
          }}
        />
      ))}
    </div>
  );
};

function SubCard({
  sub: s, internal, isPending, chargePending, expanded, onToggleHistory,
  rescheduling, rescheduleDate, setRescheduleDate, onStartReschedule, onCancelReschedule,
  onAction, onChargeNow,
}: any) {
  const isPaused = s.status === "paused";
  const isActive = s.status === "active";
  const isCancelled = s.status === "cancelled";

  const { data: history = [] } = useQuery({
    queryKey: ["wine-subscription-charges", s.id],
    enabled: expanded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wine_subscription_charges")
        .select("*")
        .eq("subscription_id", s.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const statusColor = isActive ? "bg-green-100 text-green-700"
    : isPaused ? "bg-yellow-100 text-yellow-800"
    : "bg-muted text-muted-foreground";

  return (
    <div className="border border-border p-4">
      <div className="flex gap-4">
        <div className="w-16 h-20 bg-secondary flex-shrink-0 overflow-hidden">
          {s.product_image_url && <img src={s.product_image_url} alt={s.product_title} className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-foreground">{s.product_title}</h3>
              <p className="text-xs text-muted-foreground">SKU {s.sku} · {s.discount_percent}% subscriber discount</p>
            </div>
            <span className={`text-xs font-bold uppercase px-2 py-0.5 ${statusColor}`}>{s.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <Select disabled={!isActive || isPending} value={String(s.quantity)} onValueChange={(v) => onAction({ action: "update", quantity: Number(v) })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 6, 12].map((n) => <SelectItem key={n} value={String(n)}>{n} bottle{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
            </Select>
            <Select disabled={!isActive || isPending} value={s.cadence} onValueChange={(v) => onAction({ action: "update", cadence: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Every month</SelectItem>
                <SelectItem value="quarterly">Every 3 months</SelectItem>
                <SelectItem value="biannual">Every 6 months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {s.next_ship_date && !rescheduling && (
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-muted-foreground">Next shipment: <strong className="text-foreground">{new Date(s.next_ship_date + "T00:00:00").toLocaleDateString()}</strong></span>
              {!isCancelled && (
                <button className="text-primary hover:underline" onClick={onStartReschedule}>Change date</button>
              )}
            </div>
          )}

          {rescheduling && (
            <div className="flex items-end gap-2 mt-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">New next-ship date</label>
                <Input type="date" value={rescheduleDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setRescheduleDate(e.target.value)} className="h-8 text-xs" />
              </div>
              <Button size="sm" className="h-8 text-xs" disabled={isPending} onClick={() => onAction({ action: "reschedule", next_ship_date: rescheduleDate })}>Save</Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancelReschedule}>Cancel</Button>
            </div>
          )}

          {!isCancelled && (
            <div className="flex flex-wrap gap-2 mt-3">
              {isActive && (
                <>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={isPending} onClick={() => onAction({ action: "skip" })}>
                    <SkipForward className="w-3 h-3" />Skip Next
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={isPending} onClick={() => { if (confirm("Ship your next order immediately? Charge happens within 24 hours.")) onAction({ action: "ship_now" }); }}>
                    <Truck className="w-3 h-3" />Ship Now
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={isPending} onClick={() => onAction({ action: "pause" })}>
                    <Pause className="w-3 h-3" />Pause
                  </Button>
                </>
              )}
              {isPaused && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-green-700" disabled={isPending} onClick={() => onAction({ action: "resume" })}>
                  <Play className="w-3 h-3" />Resume
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" disabled={isPending} onClick={() => { if (confirm("Cancel this subscription? You can re-subscribe anytime.")) onAction({ action: "cancel" }); }}>
                <X className="w-3 h-3" />Cancel
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 ml-auto" onClick={onToggleHistory}>
                <History className="w-3 h-3" />{expanded ? "Hide" : "History"} {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
              {internal && isActive && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={chargePending} onClick={onChargeNow}>
                  <Zap className="w-3 h-3" />{chargePending ? "Charging…" : "Charge now (internal)"}
                </Button>
              )}
            </div>
          )}

          {s.last_error && (
            <div className="text-xs text-destructive mt-2 bg-destructive/10 p-2">
              <strong>Last attempt failed:</strong> {s.last_error}
              {s.failure_count >= 2 && (
                <div className="mt-1 flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  <a href="https://vinoshipper.com/account" target="_blank" rel="noopener" className="underline">Update your card on file</a>
                </div>
              )}
            </div>
          )}

          {expanded && (
            <div className="mt-3 border-t border-border pt-3">
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Shipment history</h4>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No charges yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((h: any) => (
                    <li key={h.id} className="text-xs flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{new Date(h.created_at).toLocaleDateString()} · {h.quantity} bottle{h.quantity > 1 ? "s" : ""}</span>
                      <span className={h.success ? "text-green-700" : "text-destructive"}>
                        {h.success ? `✓ ${h.vs_order_id ? `Order ${h.vs_order_id}` : "Charged"}` : `✗ ${h.error ?? "Failed"}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}