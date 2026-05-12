---
name: US Fulfillment Requirement
description: All dropship partners and marketplace partners must fulfill from inside the US — enforced via fulfills_from_us flag and signup checkbox
type: constraint
---
# US Fulfillment Only

- All `dropship_partners` rows have `fulfills_from_us boolean default true`. Reject onboarding any vendor that ships from outside US.
- `marketplace_partner_applications.fulfills_from_us` (default false) — application form requires applicant to tick a confirmation checkbox before submit.
- Approved US-only POD vendors used in seed catalog: Printify (US providers Monster Digital FL, Swiftpod CA, MyLocker MI), Printful (Charlotte NC), Gooten (TN/OH/PA partners), Sticker Mule (Amsterdam NY), 4imprint (Oshkosh WI), 4inDogs (Pittsburgh PA pet), Discount Mugs (Medley FL), Candlefy (Brooklyn NY).
- Every `dropship_skus.notes` should start with `SOURCE:` and name the vendor + US fulfillment location. CMS surfaces this note inline under each SKU row in /dropship → SKUs tab.
