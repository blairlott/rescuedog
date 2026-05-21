// sync-rescue-partners
//
// Scrapes rescuedogwines.com/mission (the live WordPress source of truth)
// and upserts every rescue partner row into public.rescue_partners.
//
// - Uses Firecrawl to fetch rawHtml (DataTables renders all rows in the
//   initial HTML, then paginates client-side, so a single scrape captures
//   every partner).
// - Dedupes by lower(name): existing partners are updated (city/state/url
//   refreshed if blank), new ones are inserted.
// - Caller must have the `admin` app_role.
// - Returns { scraped, inserted, updated, skipped, total } so the admin
//   UI can show a diff toast.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCE_URL = "https://rescuedogwines.com/mission";
const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

type ParsedPartner = { name: string; url: string; city: string; state: string };

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePartners(html: string): ParsedPartner[] {
  const rows: ParsedPartner[] = [];
  // Match each <tr>...</tr> inside the partners table. The DataTable
  // rows have 3 cells: name (with optional <a href>), city, state.
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const inner = trMatch[1];
    const cells = [...inner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 3) continue;
    const nameCell = cells[0];
    const linkMatch = nameCell.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const name = decode(linkMatch ? linkMatch[2] : nameCell);
    const url = linkMatch ? linkMatch[1].trim() : "";
    const city = decode(cells[1]);
    const state = decode(cells[2]);
    if (!name || name.toLowerCase() === "organization name") continue;
    rows.push({ name, url, city, state });
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin auth: extract caller JWT, look up user, require app_role 'admin'.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Scrape live mission page.
    const fcRes = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: SOURCE_URL,
        formats: ["rawHtml"],
        onlyMainContent: false,
        waitFor: 3000,
      }),
    });
    const fcJson = await fcRes.json();
    if (!fcRes.ok) {
      console.error("[sync-rescue-partners] firecrawl error", fcJson);
      return new Response(JSON.stringify({ error: "Firecrawl scrape failed", detail: fcJson }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const html: string =
      fcJson?.data?.rawHtml ?? fcJson?.rawHtml ?? fcJson?.data?.html ?? fcJson?.html ?? "";
    if (!html) {
      return new Response(JSON.stringify({ error: "No HTML returned from scrape" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = parsePartners(html);
    console.log(`[sync-rescue-partners] parsed ${parsed.length} rows from live site`);

    // Load existing partners.
    const { data: existing, error: exErr } = await admin
      .from("rescue_partners")
      .select("id,name,city,state,url");
    if (exErr) throw exErr;
    const byName = new Map<string, { id: string; city: string; state: string; url: string }>();
    for (const p of existing ?? []) {
      byName.set(p.name.toLowerCase().trim(), p);
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const toInsert: ParsedPartner[] = [];
    for (const p of parsed) {
      const key = p.name.toLowerCase().trim();
      const ex = byName.get(key);
      if (!ex) {
        toInsert.push(p);
        continue;
      }
      // Refresh blank fields only — don't clobber admin edits.
      const patch: Record<string, string> = {};
      if (!ex.url && p.url) patch.url = p.url;
      if (!ex.city && p.city) patch.city = p.city;
      if (!ex.state && p.state) patch.state = p.state;
      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await admin
          .from("rescue_partners")
          .update(patch)
          .eq("id", ex.id);
        if (upErr) {
          console.error("[sync-rescue-partners] update failed", ex.id, upErr);
          skipped++;
        } else {
          updated++;
        }
      } else {
        skipped++;
      }
    }
    if (toInsert.length > 0) {
      const { error: insErr } = await admin.from("rescue_partners").insert(toInsert);
      if (insErr) {
        console.error("[sync-rescue-partners] insert failed", insErr);
        return new Response(
          JSON.stringify({ error: "Insert failed", detail: insErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      inserted = toInsert.length;
    }

    const { count: total } = await admin
      .from("rescue_partners")
      .select("*", { count: "exact", head: true });

    return new Response(
      JSON.stringify({
        scraped: parsed.length,
        inserted,
        updated,
        skipped,
        total: total ?? null,
        source: SOURCE_URL,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[sync-rescue-partners] fatal", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});