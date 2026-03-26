import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type RescuePartner = {
  id: string;
  name: string;
  city: string;
  state: string;
  url: string;
  created_at: string;
};

export const useRescuePartners = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["rescue-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rescue_partners")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as RescuePartner[];
    },
  });

  const addPartner = useMutation({
    mutationFn: async (partner: { name: string; city: string; state: string; url: string }) => {
      const { error } = await supabase.from("rescue_partners").insert(partner);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rescue-partners"] });
      toast({ title: "Partner added successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error adding partner", description: err.message, variant: "destructive" });
    },
  });

  const updatePartner = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; city: string; state: string; url: string }) => {
      const { error } = await supabase.from("rescue_partners").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rescue-partners"] });
      toast({ title: "Partner updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error updating partner", description: err.message, variant: "destructive" });
    },
  });

  const deletePartner = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rescue_partners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rescue-partners"] });
      toast({ title: "Partner deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error deleting partner", description: err.message, variant: "destructive" });
    },
  });

  return { ...query, addPartner, updatePartner, deletePartner };
};
