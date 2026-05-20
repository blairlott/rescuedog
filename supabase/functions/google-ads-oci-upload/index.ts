const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import {
  getGoogleAdsAccessToken,
  buildGoogleAdsHeaders,
  isAuthError,
} from '../_shared/googleAdsAuth.ts';

// Lindy POSTs offline-click conversions; we upload via Google Ads REST
// (customers/{id}:uploadClickConversions). Refresh token never leaves Lovable.

const ConversionRow = z.object({
  // At least one click identifier OR user_identifiers must be present.
  gclid: z.string().min(10).optional(),
  gbraid: z.string().min(10).optional(),
  wbraid: z.string().min(10).optional(),
  user_identifiers: z.array(z.record(z.unknown())).optional(),

  conversion_date_time: z.string().min(10), // "2026-05-15 14:22:01-07:00"
  conversion_value: z.number().finite().nonnegative(),
  currency_code: z.string().min(3).max(3).default('USD'),
  order_id: z.string().min(1).optional(),
}).refine(
  (r) => r.gclid || r.gbraid || r.wbraid || (r.user_identifiers && r.user_identifiers.length > 0),
  { message: 'each row needs gclid/gbraid/wbraid or user_identifiers' },
);

const BodySchema = z.object({
  conversion_action_id: z.string().regex(/^\d+$/, 'conversion_action_id must be numeric'),
  customer_id: z.string().optional(),
  login_customer_id: z.string().optional(),
  dry_run: z.boolean().optional().default(false),
  conversions: z.array(ConversionRow).min(1).max(2000),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Authn: shared bearer with Lindy
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const expected = Deno.env.get('LINDY_PROXY_TOKEN');
    if (!expected || token !== expected) {
      return json({ error: 'unauthorized' }, 401);
    }

    if (req.method !== 'POST') {
      return json({ error: 'method not allowed' }, 405);
    }

    // 2. Validate body
    let raw: unknown;
    try { raw = await req.json(); } catch { return json({ error: 'invalid json body' }, 400); }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
    }
    const { conversion_action_id, dry_run, conversions, customer_id, login_customer_id } = parsed.data;

    // 3. Google Ads auth
    const auth = await getGoogleAdsAccessToken({ customer_id, login_customer_id });
    if (isAuthError(auth)) {
      const status = auth.error === 'google_oauth_failed' ? 502 : 500;
      return json(auth, status);
    }
    const { accessToken, config } = auth;
    const headers = buildGoogleAdsHeaders(accessToken, config);

    // 4. Build payload
    const resourcePrefix = `customers/${config.customerId}`;
    const conversionAction = `${resourcePrefix}/conversionActions/${conversion_action_id}`;

    const apiConversions = conversions.map((c) => {
      const row: Record<string, unknown> = {
        conversionAction,
        conversionDateTime: c.conversion_date_time,
        conversionValue: c.conversion_value,
        currencyCode: c.currency_code,
      };
      if (c.order_id) row.orderId = c.order_id;
      if (c.gclid) row.gclid = c.gclid;
      if (c.gbraid) row.gbraid = c.gbraid;
      if (c.wbraid) row.wbraid = c.wbraid;
      if (c.user_identifiers?.length) row.userIdentifiers = c.user_identifiers;
      return row;
    });

    const body = {
      conversions: apiConversions,
      partialFailure: true,
      validateOnly: dry_run,
    };

    // 5. Upload
    const url = `https://googleads.googleapis.com/v20/${resourcePrefix}:uploadClickConversions`;
    const adsRes = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const adsText = await adsRes.text();
    let adsJson: any;
    try { adsJson = JSON.parse(adsText); } catch { adsJson = adsText; }

    if (!adsRes.ok) {
      await logRows(conversions, conversion_action_id, 'error', adsJson, adsRes.status);
      return json({ error: 'google_ads_api_error', status: adsRes.status, details: adsJson }, 502);
    }

    // 6. Parse partial-failure to per-row status
    const partial = adsJson?.partialFailureError;
    const failureIndexes = new Set<number>();
    const rowErrors: Record<number, unknown> = {};
    if (partial?.details && Array.isArray(partial.details)) {
      for (const d of partial.details) {
        const errs = d?.errors || [];
        for (const e of errs) {
          const idx = e?.location?.fieldPathElements?.find((p: any) => p.fieldName === 'conversions')?.index;
          if (typeof idx === 'number') {
            failureIndexes.add(idx);
            rowErrors[idx] = e;
          }
        }
      }
    }

    // Log per-row (skip in dry_run to keep the table clean)
    if (!dry_run) {
      await logRowsPerStatus(conversions, conversion_action_id, failureIndexes, rowErrors, adsJson);
    }

    return json({
      ok: true,
      dry_run,
      total: conversions.length,
      uploaded: conversions.length - failureIndexes.size,
      partial_failures: failureIndexes.size,
      results: adsJson?.results || [],
      partial_failure_error: partial || null,
    });
  } catch (e) {
    return json({ error: 'internal_error', message: (e as Error).message }, 500);
  }
});

// ---- helpers ----

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function logRows(
  rows: z.infer<typeof ConversionRow>[],
  actionId: string,
  status: 'uploaded' | 'partial_failure' | 'error',
  raw: unknown,
  httpStatus?: number,
) {
  try {
    const sb = serviceClient();
    await sb.from('oci_upload_log').insert(
      rows.map((r) => ({
        conversion_action_id: actionId,
        order_id: r.order_id || null,
        gclid: r.gclid || r.gbraid || r.wbraid || null,
        conversion_value: r.conversion_value,
        currency: r.currency_code,
        status,
        error_message: status === 'error' ? `http ${httpStatus ?? '?'}` : null,
        raw_response: raw as any,
      })),
    );
  } catch (_) { /* best-effort */ }
}

async function logRowsPerStatus(
  rows: z.infer<typeof ConversionRow>[],
  actionId: string,
  failureIdx: Set<number>,
  rowErrors: Record<number, unknown>,
  raw: unknown,
) {
  try {
    const sb = serviceClient();
    await sb.from('oci_upload_log').insert(
      rows.map((r, i) => {
        const failed = failureIdx.has(i);
        return {
          conversion_action_id: actionId,
          order_id: r.order_id || null,
          gclid: r.gclid || r.gbraid || r.wbraid || null,
          conversion_value: r.conversion_value,
          currency: r.currency_code,
          status: failed ? 'partial_failure' : 'uploaded',
          error_message: failed ? JSON.stringify(rowErrors[i]).slice(0, 1000) : null,
          raw_response: failed ? (rowErrors[i] as any) : null,
        };
      }),
    );
  } catch (_) { /* best-effort */ }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
