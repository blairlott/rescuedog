import { useMyMembership } from "@/hooks/useWineClub";
import { VS_MEMBER_DISCOUNT_PERCENT } from "@/lib/vinoshipperConfig";

/**
 * Convenience hook: true if the current customer has an active wine-club
 * membership. Drives member-price badges, club-exclusive gating, etc.
 */
export function useIsMember() {
  const { data: membership, isLoading } = useMyMembership();
  const isMember = !!membership && membership.status !== "cancelled";
  const discountPercent = isMember
    ? membership?.tier?.discount_percent ?? VS_MEMBER_DISCOUNT_PERCENT
    : 0;
  return { isMember, discountPercent, membership, isLoading };
}