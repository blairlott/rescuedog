import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { WP_SIMULATION, wpUrl } from "@/lib/wordpressConfig";
import { MOCK_PAGES } from "@/lib/wpMockData";

/**
 * Hybrid CMS read: WordPress is the source of truth (Cloudways).
 * 1. Try WP page (slug = page name) ACF fields. 2. Fall back to legacy cms_content.
 * Writes still target cms_content; retarget to WP via edge function once editors trained.
 */
export const useCmsContent = (page: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["cms-content", page],
    queryFn: async () => {
      try {
        let wpAcf: Record<string, any> | undefined;
        if (WP_SIMULATION) {
          wpAcf = MOCK_PAGES.find((p) => p.slug === page)?.acf as any;
        } else {
          const res = await fetch(wpUrl(`/wp/v2/pages?slug=${encodeURIComponent(page)}`));
          if (res.ok) {
            const arr = await res.json();
            wpAcf = arr?.[0]?.acf;
          }
        }
        if (wpAcf && Object.keys(wpAcf).length > 0) return wpAcf;
      } catch (e) {
        console.warn("WP fetch failed, falling back to cms_content:", e);
      }

      const { data, error } = await supabase
        .from("cms_content")
        .select("*")
        .eq("page", page);
      if (error) throw error;
      // Return as a map of section_key -> content
      const map: Record<string, any> = {};
      data?.forEach((row: any) => {
        map[row.section_key] = row.content;
      });
      return map;
    },
  });

  const upsert = useMutation({
    mutationFn: async ({ sectionKey, content }: { sectionKey: string; content: any }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("cms_content")
        .upsert(
          { page, section_key: sectionKey, content, updated_by: user?.id, updated_at: new Date().toISOString() },
          { onConflict: "page,section_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-content", page] });
      toast({ title: "Content saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error saving content", description: err.message, variant: "destructive" });
    },
  });

  return { content: query.data || {}, isLoading: query.isLoading, upsert };
};

// Helper to get a value with fallback to default
export const getCmsValue = (content: Record<string, any>, key: string, field: string, fallback: string): string => {
  return content[key]?.[field] ?? fallback;
};
