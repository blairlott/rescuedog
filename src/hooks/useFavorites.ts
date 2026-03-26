import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { toast } from "sonner";

export function useFavorites() {
  const { user } = useCustomerAuth();
  const queryClient = useQueryClient();

  const { data: favorites = [] } = useQuery({
    queryKey: ["customer-favorites", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_favorites")
        .select("product_handle")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((f) => f.product_handle);
    },
    enabled: !!user,
  });

  const isFavorite = (handle: string) => favorites.includes(handle);

  const toggleFavorite = useMutation({
    mutationFn: async ({
      handle,
      title,
      imageUrl,
      price,
    }: {
      handle: string;
      title: string;
      imageUrl?: string;
      price?: string;
    }) => {
      if (!user) {
        throw new Error("login_required");
      }
      const alreadyFaved = isFavorite(handle);
      if (alreadyFaved) {
        const { error } = await supabase
          .from("customer_favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("product_handle", handle);
        if (error) throw error;
        return { added: false, title };
      } else {
        const { error } = await supabase.from("customer_favorites").insert({
          user_id: user.id,
          product_handle: handle,
          product_title: title,
          product_image_url: imageUrl || null,
          product_price: price || null,
        });
        if (error) throw error;
        return { added: true, title };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["customer-favorites"] });
      toast.success(
        result.added
          ? `${result.title} added to favorites ❤️`
          : `${result.title} removed from favorites`,
        { position: "top-center" }
      );
    },
    onError: (err: Error) => {
      if (err.message === "login_required") {
        toast.error("Sign in to save favorites", {
          position: "top-center",
          action: {
            label: "Sign In",
            onClick: () => (window.location.href = "/login"),
          },
        });
      } else {
        toast.error("Failed to update favorites");
      }
    },
  });

  return { isFavorite, toggleFavorite, favorites };
}
