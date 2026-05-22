import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TILE_KEYS } from "@/lib/financeTiles";

export interface CfoBoard {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  tiles: string[];
  date_range_days: number;
  position: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "board";
}

export function useCfoBoards(userId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["cfo_boards", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cfo_boards" as any)
        .select("*")
        .eq("owner_id", userId!)
        .order("position", { ascending: true });
      if (error) throw error;
      let boards = (data as any[] as CfoBoard[]) ?? [];
      if (!boards.length) {
        // auto-create default
        const { data: ins, error: e2 } = await supabase
          .from("cfo_boards" as any)
          .insert({
            owner_id: userId,
            name: "Overview",
            slug: "overview",
            tiles: DEFAULT_TILE_KEYS,
            date_range_days: 90,
            position: 0,
            is_default: true,
          } as any)
          .select("*")
          .single();
        if (e2) throw e2;
        boards = [ins as any as CfoBoard];
        qc.invalidateQueries({ queryKey: ["cfo_boards", userId] });
      }
      return boards;
    },
  });
  return query;
}

export function useUpdateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<CfoBoard> & { id: string }) => {
      const { error } = await supabase.from("cfo_boards" as any).update(patch as any).eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfo_boards"] }),
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ownerId, name, position }: { ownerId: string; name: string; position: number }) => {
      const { data, error } = await supabase
        .from("cfo_boards" as any)
        .insert({
          owner_id: ownerId,
          name,
          slug: `${slugify(name)}-${Date.now().toString(36).slice(-4)}`,
          tiles: [],
          date_range_days: 90,
          position,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as any as CfoBoard;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfo_boards"] }),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cfo_boards" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfo_boards"] }),
  });
}

/* ---------------- Shares ---------------- */

export interface CfoBoardShare {
  id: string;
  board_id: string;
  created_by: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  share_type: "live" | "snapshot";
  message: string | null;
  snapshot: any;
  viewed_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function useIncomingShares(userId: string | null, email: string | null) {
  return useQuery({
    queryKey: ["cfo_incoming_shares", userId, email],
    enabled: !!userId,
    queryFn: async () => {
      const filters: string[] = [];
      if (userId) filters.push(`recipient_user_id.eq.${userId}`);
      if (email) filters.push(`recipient_email.eq.${email.toLowerCase()}`);
      let q = supabase
        .from("cfo_board_shares" as any)
        .select("*, cfo_boards!inner(id,name,owner_id)")
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (filters.length) q = q.or(filters.join(","));
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useOutgoingShares(boardId: string | null) {
  return useQuery({
    queryKey: ["cfo_outgoing_shares", boardId],
    enabled: !!boardId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cfo_board_shares" as any)
        .select("*")
        .eq("board_id", boardId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[] as CfoBoardShare[]) ?? [];
    },
  });
}

export function useCreateShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      board_id: string;
      created_by: string;
      recipient_email: string;
      share_type: "live" | "snapshot";
      message?: string;
      snapshot?: any;
    }) => {
      // Try to resolve recipient_user_id by email
      const email = payload.recipient_email.trim().toLowerCase();
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      const recipient_user_id = (prof as any)?.id ?? null;
      const { data, error } = await supabase
        .from("cfo_board_shares" as any)
        .insert({
          board_id: payload.board_id,
          created_by: payload.created_by,
          recipient_email: email,
          recipient_user_id,
          share_type: payload.share_type,
          message: payload.message ?? null,
          snapshot: payload.snapshot ?? null,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as any as CfoBoardShare;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfo_outgoing_shares"] });
      qc.invalidateQueries({ queryKey: ["cfo_incoming_shares"] });
    },
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cfo_board_shares" as any)
        .update({ revoked_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfo_outgoing_shares"] }),
  });
}
