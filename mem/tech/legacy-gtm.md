---
name: Legacy GTM
description: Legacy rescuedogwines.com WordPress site GTM container ID and ownership
type: reference
---
- Legacy WP site (rescuedogwines.com) GTM container: **GTM-NHTH66HM**
- Owned/managed by Lindy. Lindy maintains a custom tag on this container that POSTs events somewhere — endpoint/payload/auth still pending documentation (asked in #lindy-lovable thread `1779623723.008699`).
- Lovable's own GTM container is separate and deployed via `gtm-deploy` edge fn — do not confuse the two.
- Legacy site fires GA4 `G-9WXP6SS770` + Meta Pixel `1932984940325264` directly. Vinoshipper injector on legacy also fires GTM-5DBQXWP7.
- Stopgap for legacy funnel visibility: GA4 BigQuery export → `ga4_legacy_events` nightly pull (in flight; needs GCP service-account JSON).