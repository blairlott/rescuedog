/**
 * Generates public/sitemap.xml at predev + prebuild.
 * Static routes are hard-coded; wine product PDPs are pulled live from
 * Supabase (wine_products table) using the public anon key so a new wine
 * shows up in the sitemap on the next deploy without any manual edit.
 *
 * Robots.txt already references this sitemap at the canonical domain.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = "https://rescuedogwines.com";
const SUPABASE_URL = "https://eskqaxmypgvwtsffcbsw.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FheG15cGd2d3RzZmZjYnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjM2OTUsImV4cCI6MjA5MDAzOTY5NX0.cdmdOmmLFahgp35l09wmkuPlUgnpvpdHjdmWHH35sBs";

type Entry = { path: string; lastmod?: string; changefreq?: string; priority?: string };

const STATIC: Entry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/wines", changefreq: "weekly", priority: "0.9" },
  { path: "/shop-wine", changefreq: "weekly", priority: "0.9" },
  { path: "/wines/mix-six", changefreq: "weekly", priority: "0.8" },
  { path: "/club", changefreq: "weekly", priority: "0.9" },
  { path: "/merch", changefreq: "weekly", priority: "0.8" },
  { path: "/mission", changefreq: "monthly", priority: "0.8" },
  { path: "/wine-that-gives-back", changefreq: "monthly", priority: "0.7" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/vineyard", changefreq: "monthly", priority: "0.6" },
  { path: "/events", changefreq: "weekly", priority: "0.7" },
  { path: "/blog", changefreq: "weekly", priority: "0.7" },
  { path: "/pairings", changefreq: "monthly", priority: "0.6" },
  { path: "/store-locator", changefreq: "monthly", priority: "0.7" },
  { path: "/wholesale", changefreq: "monthly", priority: "0.6" },
  { path: "/trade-and-media", changefreq: "monthly", priority: "0.5" },
  { path: "/press", changefreq: "monthly", priority: "0.5" },
  { path: "/contact", changefreq: "monthly", priority: "0.6" },
  { path: "/donation", changefreq: "monthly", priority: "0.5" },
  { path: "/compare", changefreq: "monthly", priority: "0.5" },
  { path: "/ambassadors", changefreq: "monthly", priority: "0.6" },
  { path: "/ambassadors/find", changefreq: "monthly", priority: "0.5" },
  { path: "/sell", changefreq: "monthly", priority: "0.4" },
  { path: "/subscribe", changefreq: "monthly", priority: "0.5" },
  { path: "/policies", changefreq: "yearly", priority: "0.3" },
];

async function fetchWineHandles(): Promise<Array<{ handle: string; updated_at?: string }>> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/wine_products?select=handle,updated_at&is_active=eq.true&order=updated_at.desc`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if (!res.ok) {
      console.warn(`[sitemap] wine_products fetch failed (${res.status}); falling back to static entries only`);
      return [];
    }
    const rows = (await res.json()) as Array<{ handle?: string; updated_at?: string }>;
    return rows.filter((r) => !!r.handle).map((r) => ({ handle: r.handle!, updated_at: r.updated_at }));
  } catch (e) {
    console.warn("[sitemap] wine_products fetch threw", e);
    return [];
  }
}

function render(entries: Entry[]): string {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ].filter(Boolean).join("\n"),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

async function main() {
  const wines = await fetchWineHandles();
  const wineEntries: Entry[] = wines.map((w) => ({
    path: `/product/${w.handle}`,
    lastmod: w.updated_at ? w.updated_at.slice(0, 10) : undefined,
    changefreq: "weekly",
    priority: "0.8",
  }));
  const all = [...STATIC, ...wineEntries];
  writeFileSync(resolve("public/sitemap.xml"), render(all));
  console.log(`sitemap.xml written (${all.length} entries — ${wineEntries.length} wine PDPs)`);
}

main();