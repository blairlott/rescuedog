import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseFile, type ParsedDataset } from "@/lib/finance/parseFile";

export interface CfoDataset {
  id: string;
  owner_id: string;
  name: string;
  source_type: "upload" | "live_db";
  source_format: string | null;
  source_ref: string | null;
  visibility: "private" | "shared";
  row_count: number;
  column_meta: { name: string; type: "number" | "date" | "string" }[];
  created_at: string;
  updated_at: string;
}

export function useCfoDatasets() {
  return useQuery({
    queryKey: ["cfo_datasets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cfo_datasets" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CfoDataset[];
    },
  });
}

export function useCfoDatasetRows(datasetId: string | null) {
  return useQuery({
    queryKey: ["cfo_dataset_rows", datasetId],
    enabled: !!datasetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cfo_dataset_rows" as any)
        .select("row_index, data")
        .eq("dataset_id", datasetId!)
        .order("row_index", { ascending: true })
        .limit(50000);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => r.data as Record<string, any>);
    },
  });
}

export function useUploadDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { file: File; name: string; visibility: "private" | "shared" }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const parsed: ParsedDataset = await parseFile(args.file);
      // Upload original file to storage for record-keeping
      const path = `${u.user.id}/${Date.now()}_${args.file.name}`;
      await supabase.storage.from("cfo-finance").upload(path, args.file, { upsert: false });
      // Insert dataset
      const { data: ds, error: e1 } = await supabase
        .from("cfo_datasets" as any)
        .insert({
          owner_id: u.user.id,
          name: args.name,
          source_type: "upload",
          source_format: args.file.name.split(".").pop()?.toLowerCase() ?? null,
          source_ref: path,
          visibility: args.visibility,
          row_count: parsed.rows.length,
          column_meta: parsed.columns,
        })
        .select("id")
        .single();
      if (e1) throw e1;
      const datasetId = (ds as any).id as string;
      // Insert rows in batches of 500
      const batchSize = 500;
      for (let i = 0; i < parsed.rows.length; i += batchSize) {
        const slice = parsed.rows.slice(i, i + batchSize).map((row, idx) => ({
          dataset_id: datasetId,
          row_index: i + idx,
          data: row,
        }));
        const { error: e2 } = await supabase.from("cfo_dataset_rows" as any).insert(slice);
        if (e2) throw e2;
      }
      return datasetId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfo_datasets"] }),
  });
}

export function useDeleteDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cfo_datasets" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfo_datasets"] }),
  });
}

export interface CfoSavedView {
  id: string;
  owner_id: string;
  dataset_id: string | null;
  name: string;
  visibility: "private" | "shared";
  config: any;
  pinned_to_dashboard: boolean;
  email_daily: boolean;
  created_at: string;
}

export function useSavedViews(datasetId?: string) {
  return useQuery({
    queryKey: ["cfo_saved_views", datasetId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("cfo_saved_views" as any).select("*").order("created_at", { ascending: false });
      if (datasetId) q = q.eq("dataset_id", datasetId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CfoSavedView[];
    },
  });
}

export function useSaveView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Omit<CfoSavedView, "id" | "owner_id" | "created_at"> & { id?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      if (v.id) {
        const { error } = await supabase.from("cfo_saved_views" as any).update({
          name: v.name, visibility: v.visibility, config: v.config,
          pinned_to_dashboard: v.pinned_to_dashboard, email_daily: v.email_daily,
        }).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cfo_saved_views" as any).insert({
          owner_id: u.user.id, dataset_id: v.dataset_id, name: v.name,
          visibility: v.visibility, config: v.config,
          pinned_to_dashboard: v.pinned_to_dashboard, email_daily: v.email_daily,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfo_saved_views"] }),
  });
}

export function useDeleteView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cfo_saved_views" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfo_saved_views"] }),
  });
}