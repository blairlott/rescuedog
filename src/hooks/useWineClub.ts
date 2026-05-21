import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { toast } from "sonner";
import { getNextShipmentDateForFrequency } from "@/lib/wineClubSchedule";

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
        .eq("is_gift", false)
        .neq("status", "cancelled")
        .maybeSingle();
      if (error) throw error;
      return data as (WineClubMembership & { tier: WineClubTier }) | null;
    },
  });
}

/**
 * Gift memberships the current user has purchased for others.
 * Returned in newest-first order.
 */
export function useMyGiftMemberships() {
  const { user } = useCustomerAuth();
  return useQuery({
    queryKey: ["wine-club-gifts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wine_club_memberships")
        .select("*, tier:wine_club_tiers!tier_id(*)")
        .eq("user_id", user!.id)
        .eq("is_gift", true)
        .order("joined_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (WineClubMembership & { tier: WineClubTier })[];
    },
  });
}

export interface JoinClubData {
  tier_id: string;
  shipping_address_line1?: string;
  shipping_address_line2?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_zip?: string;
  wine_preferences?: string[];
  is_gift?: boolean;
  gift_message?: string;
  gift_recipient_name?: string;
  gift_recipient_email?: string;
}

export function useJoinClub() {
  const { user } = useCustomerAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: JoinClubData) => {
      if (!user) throw new Error("Must be logged in");
      // Compute the next ship date based on the tier's cadence so the
      // member's dashboard reflects when they'll actually receive wine.
      const { data: tierRow } = await supabase
        .from("wine_club_tiers")
        .select("frequency")
        .eq("id", data.tier_id)
        .maybeSingle();
      const nextShipDate = getNextShipmentDateForFrequency(tierRow?.frequency);
      const { data: inserted, error } = await supabase
        .from("wine_club_memberships")
        .insert({
          user_id: user.id,
          ...data,
          payment_status: "simulated",
          status: "active",
          next_shipment_date: nextShipDate,
          origin: data.is_gift ? "app_curated_gift" : "app_join",
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;

      // Fire Meta CAPI Lead + CompleteRegistration with the computed signup value
      // so OUTCOME_LEADS bidding optimizes on real $ value. Best-effort — never throw.
      try {
        const { getFbc, getFbp } = await import("@/lib/metaAttribution");
        const fbc = getFbc();
        const fbp = getFbp();
        // Pull gclaw cookie for Google Ads OCI on Subscribe.
        const gclaw = typeof document !== "undefined"
          ? (document.cookie.split("; ").find((c) => c.startsWith("gclaw="))?.split("=")[1] ?? null)
          : null;
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
        // Google Ads OCI: fire Subscribe with computed annual value so Smart
        // Bidding learns lead quality. Best-effort; respects kennel_oci_enabled.
        try {
          const { computeWineClubSignupValue } = await import("@/lib/wineClubSignupValue");
          const value = await computeWineClubSignupValue();
          await supabase.functions.invoke("google-ads-event", {
            body: {
              event_name: "Subscribe",
              event_id: `sub_${inserted?.id ?? "unknown"}`,
              value: value.predicted_ltv_usd || value.lead_value_usd || 0,
              currency: "USD",
              gclaw,
              email: user.email ?? null,
            },
          });
        } catch (e) {
          console.warn("[wine-club] Google Ads OCI Subscribe fire failed (non-fatal)", e);
        }
        // Mailchimp lifecycle: tag as active wine club member.
        if (user.email) {
          await supabase.functions.invoke("mailchimp-tag", {
            body: {
              email: user.email,
              event_type: "wine_club_joined",
              tags_added: ["wine_club_active", `wc_tier_${data.tier_id}`],
              tags_removed: ["wine_club_cancelled", "exclude_active_30d"],
              merge_fields: {
                WCSTATUS: "active",
                WCTIER: data.tier_id,
                WCJOIN: new Date().toISOString().slice(0, 10),
              },
            },
          });
        }
      } catch (e) {
        console.warn("[wine-club] CAPI Lead fire failed (non-fatal)", e);
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["wine-club-membership"] });
      qc.invalidateQueries({ queryKey: ["wine-club-gifts"] });
      if (variables.is_gift) {
        toast.success(
          `Gift sent! ${variables.gift_recipient_name || "Your recipient"} will hear from us soon. 🎁`,
        );
      } else {
        toast.success("Welcome to the Wine Club! 🍷");
      }
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
