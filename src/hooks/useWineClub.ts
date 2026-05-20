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
  discount_percent: number;
  shipment_discount_percent: number | null;
  description: string | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
  vinoshipper_club_id?: string | null;
  vinoshipper_join_url?: string | null;
  vinoshipper_last_synced_at?: string | null;
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
  vinoshipper_customer_id?: string | null;
  vinoshipper_membership_id?: string | null;
  origin?: string | null;
  is_legacy_member?: boolean | null;
  app_tier_config_id?: string | null;
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
        .select("*, tier:wine_club_tiers!tier_id(*)")
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
      const { data: inserted, error } = await supabase.from("wine_club_memberships").insert({
        user_id: user.id,
        ...data,
        payment_status: "simulated",
        status: "active",
        next_shipment_date: getNextShipmentDate(),
      }).select("id").maybeSingle();
      if (error) throw error;

      // Fire Meta CAPI Lead + CompleteRegistration with the computed signup value
      // so OUTCOME_LEADS bidding optimizes on real $ value. Best-effort — never throw.
      try {
        const { getFbc, getFbp } = await import("@/lib/metaAttribution");
        const fbc = getFbc();
        const fbp = getFbp();
        await supabase.functions.invoke("meta-capi-lead", {
          body: {
            event_id: inserted?.id,
            email: user.email ?? null,
            city: data.shipping_city,
            state: data.shipping_state,
            zip: data.shipping_zip,
            country: "us",
            tier_id: data.tier_id,
            fbc,
            fbp,
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          },
        });
        // Also fire a Meta CAPI `Subscribe` event with annual tier value.
        // Different event_id suffix so it doesn't collide with the Lead row.
        await supabase.functions.invoke("meta-capi-event", {
          body: {
            event_name: "Subscribe",
            event_id: `sub_${inserted?.id ?? crypto.randomUUID()}`,
            tier_id: data.tier_id,
            email: user.email ?? null,
            city: data.shipping_city,
            state: data.shipping_state,
            zip: data.shipping_zip,
            country: "us",
            fbc,
            fbp,
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
            custom_data: { membership_id: inserted?.id, tier_id: data.tier_id },
          },
        });
        // Mailchimp lifecycle: tag as active wine club member.
        if (user.email) {
          await supabase.functions.invoke("mailchimp-tag", {
            body: {
              email: user.email,
              event_type: "wine_club_joined",
              tags_added: ["wine_club_active", `wc_tier_${data.tier_id}`, `wc_freq_${data.frequency}`],
              tags_removed: ["wine_club_cancelled", "exclude_active_30d"],
              merge_fields: {
                WCSTATUS: "active",
                WCTIER: data.tier_id,
                WCFREQ: data.frequency,
                WCJOIN: new Date().toISOString().slice(0, 10),
              },
            },
          });
        }
      } catch (e) {
        console.warn("[wine-club] CAPI Lead fire failed (non-fatal)", e);
      }
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
