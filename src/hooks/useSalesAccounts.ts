import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type SalesAccount = Tables<"sales_accounts">;
export type SalesAccountInsert = TablesInsert<"sales_accounts">;
export type SalesAccountUpdate = TablesUpdate<"sales_accounts">;
export type SalesActivity = Tables<"sales_activities">;

export function useSalesAccounts(filters?: { state?: string; premiseType?: string; status?: string; search?: string }) {
  return useQuery({
    queryKey: ["sales_accounts", filters],
    queryFn: async () => {
      let query = supabase.from("sales_accounts").select("*").order("account_name");

      if (filters?.state) query = query.eq("state", filters.state);
      if (filters?.premiseType) query = query.eq("premise_type", filters.premiseType);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.search) query = query.ilike("account_name", `%${filters.search}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data as SalesAccount[];
    },
  });
}

export function useSalesAccount(id: string | undefined) {
  return useQuery({
    queryKey: ["sales_account", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from("sales_accounts").select("*").eq("id", id).single();
      if (error) throw error;
      return data as SalesAccount;
    },
    enabled: !!id,
  });
}

export function useAccountActivities(accountId: string | undefined) {
  return useQuery({
    queryKey: ["sales_activities", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await supabase
        .from("sales_activities")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesActivity[];
    },
    enabled: !!accountId,
  });
}

export function useUpsertAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (account: SalesAccountInsert & { id?: string }) => {
      if (account.id) {
        const { id, ...rest } = account;
        const { data, error } = await supabase.from("sales_accounts").update(rest as SalesAccountUpdate).eq("id", id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from("sales_accounts").insert(account).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales_accounts"] }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales_accounts"] }),
  });
}

export function useAddActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (activity: { account_id: string; activity_type: string; description: string }) => {
      const { data, error } = await supabase.from("sales_activities").insert(activity).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["sales_activities", vars.account_id] }),
  });
}
