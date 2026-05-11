import { useQuery } from "@tanstack/react-query";
import { WP_SIMULATION, wpUrl, WP_WINE_CPT } from "@/lib/wordpressConfig";
import { MOCK_PAGES, MOCK_POSTS, MOCK_WINES, type WpPage, type WpPost, type WpWine } from "@/lib/wpMockData";
import { supabase } from "@/integrations/supabase/client";

/** Convert a content_index row into the WpPost shape used by the UI. */
function ciToWpPost(r: any): WpPost {
  return {
    id: r.id,
    slug: r.slug,
    date: r.published_at || r.synced_at,
    title: { rendered: r.title || "" },
    excerpt: { rendered: r.excerpt || "" },
    content: { rendered: r.body_html || "" },
    _embedded: r.author
      ? { author: [{ name: r.author }] as any, "wp:featuredmedia": r.cover_image_url ? [{ source_url: r.cover_image_url }] as any : undefined }
      : (r.cover_image_url ? { "wp:featuredmedia": [{ source_url: r.cover_image_url }] as any } : undefined),
  } as any;
}

async function wpGet<T>(path: string): Promise<T> {
  const res = await fetch(wpUrl(path), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`WP ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** Fetch a WP page by slug. Falls back to mock dataset in simulation. */
export function useWpPage(slug: string) {
  return useQuery({
    queryKey: ["wp-page", slug, WP_SIMULATION],
    queryFn: async (): Promise<WpPage | null> => {
      if (WP_SIMULATION) return MOCK_PAGES.find((p) => p.slug === slug) ?? null;
      const arr = await wpGet<WpPage[]>(`/wp/v2/pages?slug=${encodeURIComponent(slug)}`);
      return arr[0] ?? null;
    },
  });
}

/** Fetch latest blog posts. */
export function useWpPosts(perPage = 10) {
  return useQuery({
    queryKey: ["wp-posts", perPage, WP_SIMULATION],
    queryFn: async (): Promise<WpPost[]> => {
      // Prefer Lovable-managed content first
      const { data: rows } = await supabase
        .from("content_index")
        .select("*")
        .eq("type", "post")
        .eq("is_public", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(perPage);
      if (rows && rows.length > 0) return rows.map(ciToWpPost);
      if (WP_SIMULATION) return MOCK_POSTS.slice(0, perPage);
      return wpGet<WpPost[]>(`/wp/v2/posts?per_page=${perPage}&_embed`);
    },
  });
}

/** Fetch a single blog post by slug. */
export function useWpPost(slug: string | undefined) {
  return useQuery({
    queryKey: ["wp-post", slug, WP_SIMULATION],
    enabled: !!slug,
    queryFn: async (): Promise<WpPost | null> => {
      if (!slug) return null;
      const { data: row } = await supabase
        .from("content_index")
        .select("*")
        .eq("type", "post")
        .eq("slug", slug)
        .eq("is_public", true)
        .maybeSingle();
      if (row) return ciToWpPost(row);
      if (WP_SIMULATION) return MOCK_POSTS.find((p) => p.slug === slug) ?? null;
      const arr = await wpGet<WpPost[]>(`/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed`);
      return arr[0] ?? null;
    },
  });
}

/**
 * Wine product copy (CPT) joined to a Vinoshipper SKU. VS owns price/inventory;
 * WP owns tasting notes / food pairing / awards. Use the SKU as the WP slug.
 */
export function useWpWine(sku: string | undefined) {
  return useQuery({
    queryKey: ["wp-wine", sku, WP_SIMULATION],
    enabled: !!sku,
    queryFn: async (): Promise<WpWine | null> => {
      if (!sku) return null;
      if (WP_SIMULATION) return MOCK_WINES.find((w) => w.acf.sku === sku || w.slug === sku) ?? null;
      const arr = await wpGet<WpWine[]>(`/wp/v2/${WP_WINE_CPT}?slug=${encodeURIComponent(sku)}`);
      return arr[0] ?? null;
    },
  });
}