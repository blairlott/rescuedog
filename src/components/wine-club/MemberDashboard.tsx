import { Button } from "@/components/ui/button";
import { Wine, Package, Calendar, Settings, Percent, RotateCcw, Loader2, XCircle, Gift } from "lucide-react";
import type { WineClubMembership, WineClubTier } from "@/hooks/useWineClub";
import { useMyGiftMemberships } from "@/hooks/useWineClub";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";
import { NextShipmentCustomizer } from "./NextShipmentCustomizer";
import { NextShipmentCountdown } from "./NextShipmentCountdown";
import { CancelMembershipDialog } from "./CancelMembershipDialog";
import { GiftMembershipDialog } from "./GiftMembershipDialog";
import { VinoshipperPortalPanel } from "./VinoshipperPortalPanel";
import { YourPackStats } from "./YourPackStats";
import { Link } from "react-router-dom";

const frequencyLabel: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "bi-annual": "Bi-Annual",
  yearly: "Yearly",
};

interface MemberDashboardProps {
  membership: WineClubMembership & { tier: WineClubTier };
}

export function MemberDashboard({ membership }: MemberDashboardProps) {
  const tier = membership.tier;
  const [lastItems, setLastItems] = useState<any[] | null>(null);
  const [reordering, setReordering] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const { data: gifts } = useMyGiftMemberships();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("wine_club_shipments")
        .select("id, shipment_date, items:wine_club_shipment_items(*)")
        .eq("membership_id", membership.id)
        .order("shipment_date", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      setLastItems((data as any)?.items ?? []);
    })();
  }, [membership.id]);

  const reorderLast = async () => {
    if (!lastItems || lastItems.length === 0) return;
    setReordering(true);
    try {
      for (const it of lastItems) {
        const fakeProduct: any = {
          node: {
            handle: it.product_handle,
            title: it.product_title,
            images: { edges: it.product_image_url ? [{ node: { url: it.product_image_url, altText: it.product_title } }] : [] },
          },
        };
        await addItem({
          product: fakeProduct,
          variantId: it.variant_id || it.product_handle,
          variantTitle: "Default",
          price: { amount: ((it.price_cents || 0) / 100).toFixed(2), currencyCode: "USD" },
          quantity: it.quantity || 1,
          selectedOptions: [],
        });
      }
      toast.success(`Added ${lastItems.length} bottle${lastItems.length !== 1 ? 's' : ''} to cart`, { position: "top-center" });
    } catch (e: any) {
      toast.error("Reorder failed", { description: e?.message });
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Members-first countdown — drives anticipation for the next release */}
      <NextShipmentCountdown nextShipmentDate={membership.next_shipment_date} />
      {/* Your Pack — lifetime stats */}
      <YourPackStats membershipId={membership.id} userId={(membership as any).user_id} />
      {/* Status Banner */}
      <div className="border border-primary bg-primary/5 p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Wine className="h-10 w-10 text-primary" />
            <div>
              <h2 className="text-xl font-bold text-foreground">{tier.name}</h2>
              <p className="text-sm text-muted-foreground">
                Member since {new Date(membership.joined_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary text-xs font-bold uppercase tracking-brand">
              {membership.status}
            </span>
            {membership.payment_status && membership.payment_status !== "simulated" && (
              <span className="inline-flex items-center px-3 py-1 bg-muted text-muted-foreground text-xs font-bold uppercase tracking-brand">
                {membership.payment_status}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="border border-border p-6 text-center">
          <Package className="h-8 w-8 text-primary mx-auto mb-3" />
          <p className="text-2xl font-bold text-foreground">{tier.bottle_count}</p>
          <p className="text-sm text-muted-foreground">Bottles per shipment</p>
        </div>
        <div className="border border-border p-6 text-center">
          <Calendar className="h-8 w-8 text-primary mx-auto mb-3" />
          <p className="text-2xl font-bold text-foreground">
            {membership.next_shipment_date
              ? new Date(membership.next_shipment_date).toLocaleDateString()
              : "TBD"}
          </p>
          <p className="text-sm text-muted-foreground">Next shipment</p>
        </div>
        <div className="border border-border p-6 text-center">
          <Percent className="h-8 w-8 text-primary mx-auto mb-3" />
          {tier.shipment_discount_percent && tier.shipment_discount_percent !== tier.discount_percent ? (
            <>
              <p className="text-2xl font-bold text-foreground">
                {tier.shipment_discount_percent}% / {tier.discount_percent}%
              </p>
              <p className="text-sm text-muted-foreground">Shipments / à la carte</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-foreground">{tier.discount_percent}% Off</p>
              <p className="text-sm text-muted-foreground">À la carte purchases</p>
            </>
          )}
        </div>
      </div>

      {/* One-tap reorder */}
      {lastItems && lastItems.length > 0 && (
        <div className="border border-primary bg-primary/5 p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <RotateCcw className="h-6 w-6 text-primary" />
            <div>
              <h3 className="font-bold text-foreground">Loved your last shipment?</h3>
              <p className="text-sm text-muted-foreground">
                Reorder all {lastItems.length} bottle{lastItems.length !== 1 ? 's' : ''} with one tap.
              </p>
            </div>
          </div>
          <Button onClick={reorderLast} disabled={reordering} className="uppercase tracking-brand text-xs font-bold">
            {reordering ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reorder Last Shipment"}
          </Button>
        </div>
      )}

      {/* Shipping Address */}
      <div className="border border-border p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5" /> Shipping Address
          </h3>
          <Button variant="outline" size="sm" className="text-xs uppercase tracking-brand">
            Update
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {membership.shipping_address_line1}
          {membership.shipping_address_line2 && `, ${membership.shipping_address_line2}`}
          <br />
          {membership.shipping_city}, {membership.shipping_state} {membership.shipping_zip}
        </p>
      </div>

      {/* Next Shipment Customizer — handles its own skip CTA when a shipment exists */}
      <NextShipmentCustomizer membership={membership} />

      {/* Shipment history shortcut */}
      <div className="mt-8">
        <Button asChild variant="outline" className="uppercase tracking-brand text-xs font-bold">
          <Link to="/account/shipments">
            <Package className="h-4 w-4 mr-1.5" /> View Shipment History & Tracking
          </Link>
        </Button>
      </div>

      {/* Vinoshipper member-portal deep-links */}
      <div className="mt-8">
        <VinoshipperPortalPanel vinoshipperCustomerId={(membership as any).vinoshipper_customer_id} />
      </div>

      {/* Gift a Membership */}
      <div className="mt-12 border border-primary bg-primary/5 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Gift className="h-7 w-7 text-primary shrink-0" />
            <div>
              <h3 className="font-bold text-foreground">Gift a Membership</h3>
              <p className="text-sm text-muted-foreground">
                Send a Rescue Dog Wines club membership to someone who'd love it.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setGiftOpen(true)}
            className="uppercase tracking-brand text-xs font-bold"
          >
            <Gift className="h-4 w-4 mr-1.5" /> Send a Gift
          </Button>
        </div>

        {gifts && gifts.length > 0 && (
          <div className="mt-6 pt-6 border-t border-primary/20">
            <p className="text-xs font-bold uppercase tracking-brand text-muted-foreground mb-3">
              Gifts you've sent
            </p>
            <ul className="space-y-2">
              {gifts.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between text-sm border border-border bg-background p-3"
                >
                  <div>
                    <p className="font-bold text-foreground">
                      {g.tier?.name ?? "Wine Club"}
                      {(g as any).gift_recipient_name && (
                        <span className="text-muted-foreground font-normal">
                          {" "}· for {(g as any).gift_recipient_name}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sent {new Date(g.joined_at).toLocaleDateString()}
                      {(g as any).gift_recipient_email
                        ? ` to ${(g as any).gift_recipient_email}`
                        : ""}
                    </p>
                  </div>
                  <span className="inline-flex items-center px-2 py-1 bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-brand">
                    {g.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Cancel Membership */}
      {membership.status !== "inactive" && (
        <div className="mt-12 pt-6 border-t border-border flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-foreground">Cancel Membership</p>
            <p className="text-xs text-muted-foreground">
              You can rejoin anytime. Member pricing ends immediately.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCancelOpen(true)}
            className="text-xs uppercase tracking-brand"
          >
            <XCircle className="h-4 w-4 mr-1.5" /> Cancel
          </Button>
        </div>
      )}

      <CancelMembershipDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        membershipId={membership.id}
        tierName={tier.name}
      />

      <GiftMembershipDialog open={giftOpen} onOpenChange={setGiftOpen} />
    </div>
  );
}
