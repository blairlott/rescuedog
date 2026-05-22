import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Polls Vinoshipper (the source of truth for wine club memberships) and
 * syncs the result into wine_club_memberships. Safe to call repeatedly —
 * the edge function is idempotent and short-circuits in simulation mode.
 *
 * Awaitable: callers (like checkout) should `await` so member pricing /
 * club gating reflects the latest VS state before the user hands off.
 */
export async function refreshWineClubMembership(
  queryClient?: QueryClient,
  userId?: string | null,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.functions.invoke("vinoshipper-sync-membership");
    if (queryClient) {
      const uid = userId ?? user.id;
      await queryClient.invalidateQueries({ queryKey: ["wine-club-membership", uid] });
      await queryClient.invalidateQueries({ queryKey: ["wine-club-gifts", uid] });
    }
  } catch (err) {
    // Never block checkout on VS outage
    console.warn("[refreshWineClubMembership] failed", err);
  }
}