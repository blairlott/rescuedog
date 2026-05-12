---
name: Wine Club & Subscriptions
description: Wine club, Subscribe & Save, gift certificates — auth/guest rules, Vinoshipper handoff, disclaimers
type: feature
---
- Wine purchases (one-time): guest checkout allowed via Vinoshipper deep-link.
- Subscribe & Save: REQUIRES customer account (Vinoshipper-linked) — gate the toggle for guests with Sign In / Create Account CTAs.
- Wine Club join: requires account + Vinoshipper customer link (auto-provisioned via vinoshipper-link-customer).
- All recurring billing/card storage happens on Vinoshipper (PCI). Cards never stored in our DB.
- Industry-standard disclaimers MUST appear when subscribing/joining/gifting — use `<WineClubDisclaimer variant="club|subscription|gift" />`.
- Account page hosts: Wine Club mgmt (switch/pause/cancel), Subscribe & Save list, Gift Certificates (create + print at /account/gifts/:id/print), Payment Methods (links to Vinoshipper wallet).
- Edge functions: wine-club-membership-action, wine-subscription-action, create-gift-certificate, vinoshipper-link-customer, vinoshipper-create-membership.
- Tables: wine_subscriptions, gift_certificates, wine_club_events.
