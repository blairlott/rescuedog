import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { toast } from "sonner";

export interface WineClubTier {
  id: string;
  name: string;
  slug: string;
  frequency: string;
  bottle_count: number;
  wine_type: string;
  price_cents: number;
  description: string | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

export interface WineClubMembership {
  id: string;
  user_id: string;
  tier_id: string;
  status: string;
  payment_status: string;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  gift_message: string | null;
  is_gift: boolean;
  wine_preferences: string[];
  next_shipment_date: string | null;
  joined_at: string;
  tier?: WineClubTier;
}

export function useWineClubTiers() {
  return useQuery({
    queryKey: ["wine-club-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wine_club_tiers")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as WineClubTier[];
    },
  });
}

export function useMyMembership() {
  const { user } = useCustomerAuth();
  return useQuery({
    queryKey: ["wine-club-membership", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wine_club_memberships")
        .select("*, tier:wine_club_tiers(*)")
        .eq("user_id", user!.id)
        .neq("status", "cancelled")
        .maybeSingle();
      if (error) throw error;
      return data as (WineClubMembership & { tier: WineClubTier }) | null;
    },
  });
}

export interface JoinClubData {
  tier_id: string;
  shipping_address_line1: string;
  shipping_address_line2?: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
  wine_preferences?: string[];
  is_gift?: boolean;
  gift_message?: string;
}

export function useJoinClub() {
  const { user } = useCustomerAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: JoinClubData) => {
      if (!user) throw new Error("Must be logged in");
      const { error } = await supabase.from("wine_club_memberships").insert({
        user_id: user.id,
        ...data,
        payment_status: "simulated",
        status: "active",
        next_shipment_date: getNextShipmentDate(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wine-club-membership"] });
      toast.success("Welcome to the Wine Club! 🍷");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to join");
    },
  });
}

function getNextShipmentDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(15);
  return d.toISOString().split("T")[0];
}
