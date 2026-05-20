// Lightweight client-callable wrapper to upsert + tag a Mailchimp member.
// Auth: requires a valid logged-in user JWT, OR service role.
// Body: { email, event_type, tags_added?, tags_removed?, merge_fields?, first_name?, last_name? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { syncMailchimpMember } from "../_shared/mailchimpMember.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  email: z.string().email(),
  event_type: z.string().min(1).max(64),
  tags_added: z.array(z.string().min(1).max(64)).max(20).optional(),
  tags_removed: z.array(z.string().min(1).max(64)).max(20).optional(),
  merge_fields: z.record(z.unknown()).optional(),
  first_name: z.string().max(120).nullable().optional(),
  last_name: z.string().max(120).nullable().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return J(405, { error: "method not allowed" });

  // AuthN: require logged-in user.
  let userId: string | null = null;
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return J(401, { error: "unauthorized" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await supabase.auth.getUser();
    userId = u?.user?.id ?? null;
    if (!userId) return J(401, { error: "unauthorized" });
  } catch {
    return J(401, { error: "unauthorized" });
  }

  let raw: unknown;
  try { raw = await req.json(); } catch { return J(400, { error: "invalid json" }); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return J(400, { error: "invalid_body", details: parsed.error.flatten() });

  const result = await syncMailchimpMember({
    email: parsed.data.email,
    userId,
    eventType: parsed.data.event_type,
    tagsAdded: parsed.data.tags_added,
    tagsRemoved: parsed.data.tags_removed,
    mergeFields: parsed.data.merge_fields,
    firstName: parsed.data.first_name ?? null,
    lastName: parsed.data.last_name ?? null,
  });

  return J(result.ok ? 200 : 502, result);
});