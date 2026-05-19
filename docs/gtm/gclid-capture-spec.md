# GTM GCLID Capture Spec — `GTM-5DBQXWP7` (Vinoshipper container)

Goal: capture every `gclid` / `gbraid` / `wbraid` that lands on a Vinoshipper-hosted page, persist it for 90 days, and forward it on the order so Lindy's Z3a email-match worker has a click ID for the Google Ads OCI upload.

Paste each object below into GTM exactly. Names use `Tag - …` / `Trigger - …` / `dlv - …` conventions so they sort together.

---

## A. Variables (User-Defined)

| Name | Type | Config |
|------|------|--------|
| `dlv - gclid` | Data Layer Variable | Name: `gclid`, Version 2, default `undefined` |
| `dlv - gbraid` | Data Layer Variable | Name: `gbraid`, Version 2, default `undefined` |
| `dlv - wbraid` | Data Layer Variable | Name: `wbraid`, Version 2, default `undefined` |
| `cookie - rdw_gclid` | 1st-Party Cookie | Cookie Name: `rdw_gclid`, URI-decode: on |
| `cjs - Best GCLID` | Custom JavaScript | see below |

`cjs - Best GCLID`:
```js
function(){
  return {{dlv - gclid}} || {{cookie - rdw_gclid}} || undefined;
}
```

---

## B. Triggers

1. **`Trigger - PV - Has Click ID`** — *Page View*
   - Fire on: Some Page Views
   - Condition: `Page URL` *matches RegEx* `[?&](gclid|gbraid|wbraid)=`

2. **`Trigger - DOM Ready - VS Checkout`** — *DOM Ready*
   - Fire on: Some DOM Ready Events
   - Condition: `Page Path` *matches RegEx* `^/(checkout|cart|order|thank|confirmation)`

3. **`Trigger - Form Submit - VS Checkout`** — *Form Submission*
   - Wait for Tags: on (2000ms)
   - Check Validation: on
   - Condition: `Page Path` *matches RegEx* `^/(checkout|cart|order|thank|confirmation)`

---

## C. Tags

### 1. `Tag - Persist Click ID to Cookie` — Custom HTML
Trigger: `Trigger - PV - Has Click ID`
```html
<script>
(function(){
  try {
    var u = new URL(location.href);
    var v = u.searchParams.get('gclid')
         || u.searchParams.get('gbraid')
         || u.searchParams.get('wbraid');
    if (!v) return;
    document.cookie = 'rdw_gclid=' + encodeURIComponent(v)
      + '; Max-Age=' + (90*24*60*60)
      + '; Path=/; SameSite=Lax; Secure';
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'rdw_gclid_captured', gclid: v });
  } catch (e) { /* swallow */ }
})();
</script>
```

### 2. `Tag - Inject Hidden gclid Field` — Custom HTML
Trigger: `Trigger - DOM Ready - VS Checkout`

Adds `<input name="custom_gclid">` to every form on the page so the Vinoshipper order submission carries the click ID into the webhook payload.

```html
<script>
(function(){
  var g = {{cjs - Best GCLID}};
  if (!g) return;
  var forms = document.querySelectorAll('form');
  forms.forEach(function(f){
    if (f.querySelector('input[name="custom_gclid"]')) return;
    var i = document.createElement('input');
    i.type = 'hidden';
    i.name = 'custom_gclid';
    i.value = g;
    f.appendChild(i);
  });
})();
</script>
```

### 3. `Tag - GA4 Event - rdw_checkout_with_gclid` — GA4 Event
Trigger: `Trigger - Form Submit - VS Checkout`
- Measurement ID: existing GA4 config tag reference
- Event Name: `rdw_checkout_with_gclid`
- Event Parameters:
  - `gclid` = `{{cjs - Best GCLID}}`
  - `page_path` = `{{Page Path}}`

Use this in the GA4 BigQuery export to audit match-rate week-over-week.

### 4. (Optional fallback, **do not build in v1**) `Tag - Beacon to Lovable`
If post-launch we observe that VS strips `custom_gclid` from the order payload, ship a follow-up tag that POSTs `{ gclid, vs_email }` to `/functions/v1/gclid-beacon`. That endpoint does not exist yet; only build it if needed.

---

## D. Verification in GTM Preview

1. Visit `https://<vs-host>/?gclid=TEST123`
   - DevTools → Application → Cookies → `rdw_gclid=TEST123` is present.
   - DevTools → Console: `dataLayer` contains `{ event: 'rdw_gclid_captured', gclid: 'TEST123' }`.
2. Browse to `/cart` → `/checkout` in the same session.
   - DevTools → Elements: every `<form>` has `<input type="hidden" name="custom_gclid" value="TEST123">`.
3. Submit a sandbox order.
   - `Tag - GA4 Event - rdw_checkout_with_gclid` fires.
   - Lovable Cloud → Edge Function logs for `vinoshipper-webhook`: order payload contains `custom_gclid` in `customFields` (or wherever VS exposes it).

---

## E. Downstream handoff (for Lindy)

- Webhook + `_shared/serverConversions.ts` already accept `gclid`.
- After GTM ships, Lindy's Z3a worker must read `custom_gclid` from the order's custom fields and attach it to the OCI payload sent to `/functions/v1/google-ads-oci-upload` (Phase 2).
- For orders missing `custom_gclid` (organic, direct, non-Google paid), Z3a should fall back to email-match-only and let Google's Enhanced Conversions reconciliation do the work.

---

## Container target

- Container: **GTM-5DBQXWP7** (Vinoshipper-hosted producer pages)
- Workspace: create a new workspace named `gclid-capture-v1`, paste objects, publish with the description: "Capture gclid/gbraid/wbraid → cookie → hidden form field → GA4 event."
