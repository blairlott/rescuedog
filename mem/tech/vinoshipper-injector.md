---
name: Vinoshipper Injector (canonical integration)
description: Use the Vinoshipper Injector JS for cart, add-to-cart, and club registration so Vinoshipper owns PCI/payment/compliance/card-on-file
type: feature
---
Source: https://developer.vinoshipper.com/docs/injector-getting-started (audited 2026-05-10).

## What it is
A drop-in JS bundle from Vinoshipper that renders THEIR cart, checkout, and club-registration UI on OUR domain. They own PCI, age verification, tax, shipping, recurring billing, and card-on-file. We own the surrounding brand/UX.

## Install (once, in index.html or wine-route layout)
```html
<script src="https://vinoshipper.com/injector/index.js"></script>
<script>
  window.document.addEventListener('vinoshipper:loaded', () => {
    window.Vinoshipper.init(VS_ACCOUNT_ID, { /* theming */ });
  }, false);
</script>
```
- Need: VS Account ID (Vinoshipper Producer -> Account -> Profile)
- Reference: window.top.Vinoshipper for cross-frame safety

## Components we will use
- `<div class="vs-add-to-cart" data-vs-product-id="VS_PRODUCT_ID"></div>` per-product Add to Cart button on every wine PDP / shop card.
- Vinoshipper Cart + Cart Button render automatically once the injector is initialized. Configure cartPosition/cartButton via Vinoshipper.init() 2nd arg.
- `<div class="vs-club-registration"></div>` canonical club signup form (collects card on file, mandatory for recurring shipments).
- Optional: vs-product-list, vs-announcement, vs-available-in, vs-product-item.

## A la carte order architecture (final)
1. Our React shop renders product cards with our own copy/imagery/award badges.
2. Each card embeds the vs-add-to-cart div bound to the Vinoshipper product ID via a vinoshipper_product_id Shopify metafield (or product-mapping table).
3. Vinoshipper Injector owns the cart drawer + checkout (PCI, age verify, tax, shipping; member discount auto-applied because Vinoshipper identifies the customer).
4. Webhooks (vinoshipper-webhook edge fn) sync order status into our DB for analytics + CRM.

## Wine club architecture (final)
1. Marketing/info, FAQ, tier descriptions, branding our React app.
2. Signup CTA our /club page hosts the vs-club-registration form.
3. Vinoshipper collects card on file and creates the recurring membership.
4. Webhook updates wine_club_memberships in our DB with vinoshipper_membership_id, status, next shipment date, etc.
5. Our member dashboard shows curated upcoming shipments, swap options, perks. "Update payment method" / "Cancel" buttons deep-link to Vinoshipper hosted pages until Injector exposes equivalents.

## Why no custom checkout
- Card-on-file for recurring shipments REQUIRES Vinoshipper-side tokenization.
- State wine-shipping compliance is theirs to maintain.
- Avoids PCI scope on us.
- Member discount + shipping-included rules are enforced by Vinoshipper at order time.

## What stays custom on our side
- Marketing pages, tier explainer, FAQ, member benefits copy
- Member dashboard UX (preferences, favorites, dog rescue selection, referrals)
- Curated shipment proposal/swap UI (our own, syncs to VS via API for the actual order)
- CRM, donations, events, store locator, content/CMS

## Required from client
- Vinoshipper Account ID (public; safe in code)
- Vinoshipper API Key + Secret (server-side, for our edge functions)
- Per-SKU map of Shopify wine product to Vinoshipper product ID
- Webhook shared secret (already wired)
