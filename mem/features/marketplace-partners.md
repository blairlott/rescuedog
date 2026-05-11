---
name: Marketplace Partner Program
description: Amazon-style apply-to-sell flow with admin approval for partners and per-product listings
type: feature
---
- Public application page at `/sell` (footer link "Sell on Rescue Dog"). Inserts to `marketplace_partner_applications` with `agreed_to_terms = true` required by RLS.
- Approval flow in `/dropship` → Marketplace tab:
  - Approving an application creates a `dropship_partners` row (vendor_type from fulfillment_model, simulation_mode=true) and stores `approved_partner_id`.
  - Per-product submissions land in `marketplace_partner_products`. Approving creates an INACTIVE `dropship_skus` draft so admins finalize pricing/imagery before going live.
- Admins (admin/owner/dropship_manager) are the only roles that can view/manage applications & products.
- Self-curation system (`merch-curation-scan`) operates on the resulting dropship_skus, so approved marketplace products inherit availability/margin watching automatically.
