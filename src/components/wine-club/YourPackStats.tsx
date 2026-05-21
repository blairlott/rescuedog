import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PawPrint, Package, Trophy } from "lucide-react";

export function YourPackStats({ membershipId, userId }: { membershipId: string; userId?: string | null }) {
  const [stats, setStats] = useState<{ shipments: number; bottles: number; points: number; tier: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [shipRes, loyaltyRes] = await Promise.all([
        supabase
          .from("wine_club_shipments")
          .select("id, items:wine_club_shipment_items(quantity)")
          .eq("membership_id", membershipId)
          .in("status", ["shipped", "delivered", "dispatched"]),
        userId
          ? supabase.from("loyalty_accounts").select("points_balance, tier").eq("user_id", userId).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      const shipments = (shipRes.data ?? []) as any[];
      const bottles = shipments.reduce(
        (s, r) => s + ((r.items ?? []).reduce((x: number, it: any) => x + (it.quantity || 0), 0)),
        0,
      );
      setStats({
        shipments: shipments.length,
        bottles,
        points: (loyaltyRes as any)?.data?.points_balance ?? 0,
        tier: (loyaltyRes as any)?.data?.tier ?? "rescue",
      });
    })();
  }, [membershipId, userId]);

  if (!stats) return null;

  return (
    <div className="border border-border p-5 md:p-6 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <PawPrint className="h-5 w-5 text-primary" />
        <h3 className="font-bold uppercase tracking-brand text-sm text-foreground">Your Pack</h3>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-3xl font-bold leading-none">{stats.shipments}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Package className="h-3 w-3" /> Shipments received
          </div>
        </div>
        <div>
          <div className="text-3xl font-bold leading-none">{stats.bottles}</div>
          <div className="text-xs text-muted-foreground mt-1">Bottles enjoyed</div>
        </div>
        <div>
          <div className="text-3xl font-bold leading-none">{stats.points.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Trophy className="h-3 w-3" /> Pack points · {stats.tier}
          </div>
        </div>
      </div>
    </div>
  );
}