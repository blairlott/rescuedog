# WordPress-side bucketing script — pre-DNS-cut A/B

Use this **before** repointing apex DNS. Visitors hit the existing WordPress
site as usual; a small inline script buckets them 50/50 and silently
redirects bucket B to `new.rescuedogwines.com` (the Lovable preview /
staging hostname). The bucket is sticky for 30 days.

## Where to install

WordPress → **Appearance → Theme File Editor** → `header.php`, immediately
after the opening `<head>` tag. Or use a header-injection plugin (Insert
Headers and Footers, WPCode, etc.). It **must** load before any other script
so the redirect happens before render.

## Knobs

| Constant | Purpose |
| --- | --- |
| `NEW_HOST` | Lovable hostname to redirect bucket B to |
| `LOVABLE_WEIGHT` | % of new visitors sent to Lovable (start at 20, ramp) |
| `COOKIE_NAME` | Sticky bucket cookie name (shared with the worker later) |
| `COOKIE_DAYS` | Bucket TTL |
| `EXCLUDE_PATHS` | WP paths that must never redirect (admin, checkout, etc.) |
| `FORCE_PARAM` | `?rdw_force=lovable\|legacy` for QA |

## Snippet (paste in `<head>` of WP, top of stack)

```html
<script>
(function () {
  var NEW_HOST       = "new.rescuedogwines.com";
  var LOVABLE_WEIGHT = 20;                        // ramp later: 20 -> 50
  var COOKIE_NAME    = "rdw_variant";
  var COOKIE_DAYS    = 30;
  var EXCLUDE_PATHS  = ["/wp-admin", "/wp-login", "/checkout", "/cart", "/my-account"];
  var FORCE_PARAM    = "rdw_force";

  try {
    var path = location.pathname.toLowerCase();
    for (var i = 0; i < EXCLUDE_PATHS.length; i++) {
      if (path === EXCLUDE_PATHS[i] || path.indexOf(EXCLUDE_PATHS[i] + "/") === 0) return;
    }

    // Honor a QA override and persist it.
    var qs = new URLSearchParams(location.search);
    var forced = qs.get(FORCE_PARAM);
    var bucket = null;

    if (forced === "lovable" || forced === "legacy") {
      bucket = forced;
    } else {
      // Read existing cookie.
      var m = document.cookie.match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]+)"));
      if (m) bucket = decodeURIComponent(m[1]);
    }

    // Assign a fresh bucket if none.
    if (bucket !== "lovable" && bucket !== "legacy") {
      bucket = Math.random() * 100 < LOVABLE_WEIGHT ? "lovable" : "legacy";
    }

    // Persist.
    var exp = new Date(Date.now() + COOKIE_DAYS * 86400 * 1000).toUTCString();
    document.cookie =
      COOKIE_NAME + "=" + encodeURIComponent(bucket) +
      "; Path=/; Expires=" + exp + "; Secure; SameSite=Lax";

    // GA4 / GTM: expose to dataLayer BEFORE GTM container fires.
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ site_variant: bucket, ab_test: "rdw_replatform_v1" });

    // Only redirect bucket B; bucket A stays on WP.
    if (bucket === "lovable") {
      // Preserve path + query (incl. gclid/utm) so attribution carries over.
      var target = "https://" + NEW_HOST + location.pathname + location.search + location.hash;
      // Use replace() so back button doesn't trap the user in a redirect loop.
      location.replace(target);
    }
  } catch (e) {
    // Fail open: stay on WP. Never block render on bucketing.
    if (window.console && console.warn) console.warn("[rdw_ab] bucketing failed", e);
  }
})();
</script>
```

## On the Lovable side

Add a matching `dataLayer.push({ site_variant: "lovable", ab_test: "rdw_replatform_v1" })`
to the GTM container (or `index.html` head) so both sides emit the same
dimension. The GCLID capture spec already preserves `?gclid=` across the
redirect, so OCI uploads continue to work.

In GTM:

1. Variable: **Data Layer Variable** → `site_variant`
2. Tag: **GA4 Event** → "config update" → User Property `site_variant`
3. Same setup on both stacks so the variable resolves identically.

## QA checklist

- [ ] Visit WP root → cookie set, ~20% redirect to `new.rescuedogwines.com`
- [ ] Same browser, second visit → same bucket (cookie sticky)
- [ ] `?rdw_force=lovable` → redirects, cookie updated to `lovable`
- [ ] `?rdw_force=legacy` → stays on WP, cookie updated to `legacy`
- [ ] `/wp-admin`, `/checkout`, `/cart` never redirect regardless of bucket
- [ ] `?gclid=test123` survives the redirect (check URL on Lovable)
- [ ] GA4 realtime → both `site_variant=legacy` and `site_variant=lovable`
      events appear
- [ ] Vinoshipper handoff still works in bucket B (wine checkout)
- [ ] Shopify cart on Lovable shows `source=lovable` cart attribute (see
      `src/lib/shopify.ts` `shopifyCartCreate`)

## When to switch off

Remove this snippet from WP **the moment you cut apex DNS to Lovable**.
Otherwise users on the apex will get a self-redirect from WP that no longer
exists. After cut-over, use the Cloudflare Worker split
(`docs/abtest/cloudflare-worker-split.md`) instead.