// Pre-checkout compliance check for the v2 unified checkout.
//
// Today: returns a stubbed `{ allowed: true }` so the interstitial UI can be
// built and tested without hitting Vinoshipper. When VS credentials are
// confirmed, swap the stub for a real call to:
//   POST https://vinoshipper.com/api/v3/p/orders/check-compliance
// (see _shared/vinoshipper.ts for auth helpers).

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BodySchema = z.object({
  dob: z.string().min(8),
  shipToState: z.string().length(2),
  shipToZip: z.string().min(5).max(10),
  products: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .default([]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- STUB ---
    // Replace this block with a real vsFetch call once VS confirms the
    // exact request shape and we have a test SKU mapped.
    const stub = {
      stub: true,
      allowed: true,
      blockedSkus: [] as string[],
      reasons: [] as string[],
      complianceToken: crypto.randomUUID(),
      expiresAt: Date.now() + 30 * 60 * 1000,
      estimate: {
        taxesCents: 0,
        feesCents: 0,
        shippingCents: 0,
      },
      echo: parsed.data,
    };

    return new Response(JSON.stringify(stub), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});