---
name: Email Test Mode
description: Pre-launch test mode that reroutes all form-triggered transactional emails to Blair + Lindy only, with S&S exempt
type: feature
---
**Pre-launch test mode** for all form-triggered transactional emails.

- Stored in `app_settings` row `email_test_mode` as `{enabled, recipients[], exempt_templates[], note}`.
- Default ON; recipients: `blair.lott@rescuedogwines.com`, `default-blair.lott@lindymail.ai`.
- Intercepts inside `send-transactional-email` edge function BEFORE suppression check.
- Fans out to all test recipients; skips BCC to info@ for rerouted sends.
- Exempt templates (S&S) follow normal routing: `wine-subscription-card-expiring`, `wine-subscription-payment-failed`, `club-shipment-shipped`, `club-gift-shipment-shipped`.
- Editable from `/cms/forms`.
- **Disable before launch.** Standing rule post-launch: no outbound customer emails except S&S; all other customer mail routes via Mailchimp or Vinoshipper.

**Form inventory** lives in `form_email_inventory` table (CMS-editable at `/cms/forms`). Lists every form, trigger, audience, recipient, and template. Seeded with: Contact, Wholesale, Wine Club, Ambassador, Donation, Events, Gifts, Welcome series, Merch abandoned checkout, Stale account alerts, Dropship PO, Staff/Reviewer invites.
