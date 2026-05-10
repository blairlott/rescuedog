import { useQuery } from "@tanstack/react-query";
import { WP_SIMULATION, wpUrl, WP_WINE_CPT } from "@/lib/wordpressConfig";
import { MOCK_PAGES, MOCK_POSTS, MOCK_WINES, type WpPage, type WpPost, type WpWine } from "@/lib/wpMockData";

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