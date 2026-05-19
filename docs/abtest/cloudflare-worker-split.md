# Cloudflare Worker — Legacy vs Lovable A/B split

Sticky 50/50 (configurable) split for `rescuedogwines.com` after the apex DNS
is cut to Lovable. Sits in front of Lovable in **proxy mode** and routes a
share of traffic to the legacy WP/Shopify origin instead.

## Prereqs

1. Lovable custom domain added in **proxy mode** (Connect Domain → Advanced →
   "Domain uses Cloudflare or a similar proxy"). DNS becomes CNAME-based.
2. Legacy site kept alive at a second hostname, e.g.
   `legacy.rescuedogwines.com`, pointed at the old WP host with its own valid
   cert. Cloudflare must be able to reach it over HTTPS.
3. Cloudflare account on the same zone, Workers enabled.

## Knobs

| Env var | Default | Purpose |
| --- | --- | --- |
| `LOVABLE_HOST` | `rescuedogwines.lovable.app` | Lovable origin hostname |
| `LEGACY_HOST` | `legacy.rescuedogwines.com` | Old WP/Shopify origin |
| `LOVABLE_WEIGHT` | `50` | % of new visitors sent to Lovable (0–100) |
| `COOKIE_NAME` | `rdw_variant` | Sticky bucket cookie |
| `COOKIE_DAYS` | `30` | Bucket TTL |
| `FORCE_PARAM` | `rdw_force` | `?rdw_force=lovable\|legacy` for QA |
| `EXCLUDE_PATHS` | `/crm,/cms,/kennel,/admin,/intelligence` | Always Lovable |

## Worker

```js
// worker.js — deploy with `wrangler deploy` and bind to your zone route
// Route: rescuedogwines.com/*  (and www.rescuedogwines.com/* if you use www)

const cfg = (env) => ({
  LOVABLE_HOST:   env.LOVABLE_HOST   || "rescuedogwines.lovable.app",
  LEGACY_HOST:    env.LEGACY_HOST    || "legacy.rescuedogwines.com",
  LOVABLE_WEIGHT: Number(env.LOVABLE_WEIGHT ?? 50),
  COOKIE_NAME:    env.COOKIE_NAME    || "rdw_variant",
  COOKIE_DAYS:    Number(env.COOKIE_DAYS ?? 30),
  FORCE_PARAM:    env.FORCE_PARAM    || "rdw_force",
  EXCLUDE_PATHS:  (env.EXCLUDE_PATHS || "/crm,/cms,/kennel,/admin,/intelligence")
    .split(",").map(s => s.trim()).filter(Boolean),
});

function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name, value, days) {
  const exp = new Date(Date.now() + days * 86400 * 1000).toUTCString();
  // SameSite=Lax + Secure required by modern browsers under HTTPS
  return `${name}=${encodeURIComponent(value)}; Path=/; Expires=${exp}; Secure; SameSite=Lax`;
}

function pickBucket(weightLovable) {
  return Math.random() * 100 < weightLovable ? "lovable" : "legacy";
}

export default {
  async fetch(request, env, ctx) {
    const c = cfg(env);
    const url = new URL(request.url);

    // Hard route paths that must always hit Lovable (CRM/CMS/admin).
    const path = url.pathname.toLowerCase();
    const forced = c.EXCLUDE_PATHS.some(p => path === p || path.startsWith(p + "/"));

    // QA override: ?rdw_force=lovable | legacy (writes the sticky cookie too).
    const qaForce = url.searchParams.get(c.FORCE_PARAM);
    let bucket = readCookie(request, c.COOKIE_NAME);
    let setBucketCookie = false;

    if (forced) {
      bucket = "lovable";
    } else if (qaForce === "lovable" || qaForce === "legacy") {
      bucket = qaForce;
      setBucketCookie = true;
    } else if (bucket !== "lovable" && bucket !== "legacy") {
      bucket = pickBucket(c.LOVABLE_WEIGHT);
      setBucketCookie = true;
    }

    const originHost = bucket === "lovable" ? c.LOVABLE_HOST : c.LEGACY_HOST;

    // Build the upstream request with the original path/query but new host.
    const upstream = new URL(url.toString());
    upstream.hostname = originHost;
    upstream.port = "";
    upstream.protocol = "https:";

    const fwd = new Request(upstream.toString(), request);
    // Some origins (Lovable, Shopify) gate on Host; let fetch set it from URL.
    // Preserve the visitor's apparent host for legacy WP analytics:
    fwd.headers.set("x-forwarded-host", url.hostname);
    fwd.headers.set("x-rdw-variant", bucket);

    let response;
    try {
      response = await fetch(fwd, { redirect: "manual" });
    } catch (err) {
      // Fail open to Lovable if legacy is down.
      if (bucket === "legacy") {
        upstream.hostname = c.LOVABLE_HOST;
        response = await fetch(new Request(upstream.toString(), request), { redirect: "manual" });
        bucket = "lovable";
        setBucketCookie = true;
      } else {
        return new Response("Upstream unavailable", { status: 502 });
      }
    }

    // Clone to mutate headers.
    const out = new Response(response.body, response);
    out.headers.set("x-rdw-variant", bucket);
    if (setBucketCookie) {
      out.headers.append("set-cookie", setCookie(c.COOKIE_NAME, bucket, c.COOKIE_DAYS));
    }
    // Stop Cloudflare from caching variant-specific HTML across buckets.
    out.headers.append("vary", "cookie");
    return out;
  },
};
```

## Deploy

```bash
# wrangler.toml
# name = "rdw-ab-split"
# main = "worker.js"
# compatibility_date = "2025-05-01"
# [vars]
# LOVABLE_HOST = "rescuedogwines.lovable.app"
# LEGACY_HOST  = "legacy.rescuedogwines.com"
# LOVABLE_WEIGHT = "20"   # start small, ramp later
#
# [[routes]]
# pattern = "rescuedogwines.com/*"
# zone_name = "rescuedogwines.com"

wrangler deploy
```

## Ramp plan

| Day | `LOVABLE_WEIGHT` | Watch |
| --- | --- | --- |
| 1   | `10` | error rate, Core Web Vitals, GA4 `site_variant` cohort |
| 3   | `25` | conversion, AOV, OCI upload volume |
| 5   | `50` | cart abandonment, Vinoshipper handoff success |
| 7   | `90` | refunds, support tickets |
| 10  | `100` and remove worker | done |

## GA4 tagging

Read the `x-rdw-variant` response header (or `rdw_variant` cookie) in GTM and
set a `site_variant` user property. Use it as a comparison dimension in every
report — never as an audience filter, or you'll lose statistical power.

## Gotchas

- **Don't proxy Shopify checkout.** Cart `checkoutUrl` opens in a new tab to
  `*.myshopify.com` — it bypasses the worker, which is what you want.
- **Vinoshipper deep links** also leave the apex, so they're unaffected.
- **Age gate cookie** lives on the apex; bucket cookie is independent. Verify
  the gate still works in both buckets.
- **Cloudbleed scanner attribution**: per the proxy-mode note in the custom
  domain docs, scanners may report the Cloudflare POP that answered the scan.
  Expected.
- **Don't run this and a client-side redirect test simultaneously** — they
  fight over the same cookie and double-count visitors.