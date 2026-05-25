// Verifies every cron/admin-gated edge function:
//   1. returns 401 with NO secret header
//   2. returns a non-401 (200/4xx-business/5xx) WITH the correct secret header
//
// Usage (from project root):
//   deno run --allow-net --allow-env supabase/functions/_tests/verify-cron-auth.ts
//
// Required env:
//   SUPABASE_URL                 e.g. https://<ref>.supabase.co
//   SUPABASE_ANON_KEY            anon/publishable key (for the apikey header)
//   CRON_SECRET                  for the 4 gated jobs
//   KENNEL_INGEST_SECRET         for kennel/ads/autopilot/radar/recommender
//   GTM_DEPLOY_ADMIN_SECRET      for gtm-deploy
//   PROVISION_ADMIN_SECRET       for provision-reviewer

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
if (!SUPABASE_URL || !ANON) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  Deno.exit(2);
}

type Target = {
  name: string;
  header: string;          // header to send the shared secret in
  envVar: string;          // env var holding that secret
  body?: unknown;          // optional payload (most accept {})
};

const TARGETS: Target[] = [
  // 4 gated cron jobs (CRON_SECRET)
  { name: "compliance-audit",            header: "x-cron-secret", envVar: "CRON_SECRET" },
  { name: "ai-creative-variants",        header: "x-cron-secret", envVar: "CRON_SECRET" },
  { name: "seo-autopilot-sweep",         header: "x-cron-secret", envVar: "CRON_SECRET" },
  { name: "auto-curate-media",           header: "x-cron-secret", envVar: "CRON_SECRET" },
  // Kennel/ads (KENNEL_INGEST_SECRET) — all have JWT fallback so 401 path is "no header AND no JWT".
  { name: "z8-nightly-optimizer",        header: "x-cron-secret",        envVar: "KENNEL_INGEST_SECRET", body: { dry_run: true } },
  { name: "keyword-recommender",         header: "x-cron-secret",        envVar: "KENNEL_INGEST_SECRET" },
  { name: "instacart-autopilot",         header: "x-cron-secret",        envVar: "KENNEL_INGEST_SECRET", body: { dry_run: true } },
  { name: "instacart-ads-execute",       header: "x-cron-secret",        envVar: "KENNEL_INGEST_SECRET", body: { dry_run: true } },
  { name: "platform-radar-scan",         header: "x-cron-secret",        envVar: "KENNEL_INGEST_SECRET" },
  { name: "meta-autopilot",              header: "x-cron-secret",        envVar: "KENNEL_INGEST_SECRET", body: { dry_run: true } },
  { name: "meta-ads-execute",            header: "x-cron-secret",        envVar: "KENNEL_INGEST_SECRET", body: { dry_run: true } },
  { name: "kennel-self-health",          header: "x-kennel-cron-secret", envVar: "KENNEL_INGEST_SECRET" },
  { name: "kennel-rule-suggestions",     header: "x-kennel-cron-secret", envVar: "KENNEL_INGEST_SECRET" },
  { name: "kennel-optimizer",            header: "x-kennel-cron-secret", envVar: "KENNEL_INGEST_SECRET", body: { dry_run: true, platform: "instacart" } },
  { name: "kennel-oci-backlog-alert",    header: "x-kennel-cron-secret", envVar: "KENNEL_INGEST_SECRET", body: { probe: true } },
  { name: "vinoshipper-conversions-backfill", header: "x-kennel-cron-secret", envVar: "KENNEL_INGEST_SECRET", body: { dry_run: true } },
  // Admin-secret endpoints (no JWT fallback — must 401 cleanly)
  { name: "gtm-deploy",                  header: "x-admin-secret", envVar: "GTM_DEPLOY_ADMIN_SECRET" },
  { name: "provision-reviewer",          header: "x-admin-secret", envVar: "PROVISION_ADMIN_SECRET" },
];

async function hit(t: Target, withSecret: boolean) {
  const url = `${SUPABASE_URL}/functions/v1/${t.name}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: ANON!,
  };
  if (withSecret) {
    const v = Deno.env.get(t.envVar);
    if (!v) return { status: 0, skipped: `env ${t.envVar} not set` };
    headers[t.header] = v;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(t.body ?? {}),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 160) };
}

const RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", RESET = "\x1b[0m";
let pass = 0, fail = 0, skipped = 0;

for (const t of TARGETS) {
  const noSecret = await hit(t, false);
  const withSecret = await hit(t, true);

  const expect401 = noSecret.status === 401;
  const expectNon401 = "skipped" in withSecret ? null : withSecret.status !== 401;

  if ("skipped" in withSecret) {
    skipped++;
    console.log(`${DIM}SKIP${RESET} ${t.name.padEnd(36)} — ${withSecret.skipped}`);
    continue;
  }

  const ok = expect401 && expectNon401;
  if (ok) {
    pass++;
    console.log(`${GREEN}PASS${RESET} ${t.name.padEnd(36)} 401(no-secret) / ${withSecret.status}(with ${t.header})`);
  } else {
    fail++;
    console.log(`${RED}FAIL${RESET} ${t.name.padEnd(36)} no-secret=${noSecret.status} with-secret=${withSecret.status}`);
    if (!expect401)    console.log(`     ${DIM}no-secret body: ${noSecret.body}${RESET}`);
    if (!expectNon401) console.log(`     ${DIM}with-secret body: ${withSecret.body}${RESET}`);
  }
}

console.log(`\n${pass} pass · ${fail} fail · ${skipped} skipped`);
Deno.exit(fail === 0 ? 0 : 1);