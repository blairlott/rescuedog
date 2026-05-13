---
name: Unified single-transaction checkout
description: Single Stripe charge covers wine + merch; Vinoshipper acts as fulfillment partner for wine compliance/shipping
type: feature
---
- Route: /checkout (src/pages/CheckoutPage.tsx) — Stripe Payment Element + address form + cart summary.
- Edge function: supabase/functions/unified-checkout/index.ts with actions create-intent and finalize.
- One Stripe PaymentIntent charges the FULL cart on RDW's Stripe account (Lovable seamless Stripe).
- Vinoshipper invoked out-of-band as fulfillment vendor for wine — currently SIMULATED (VS_SIMULATION=true mirrors front-end flag).
- Order data: public.orders + public.order_items. RLS: customers see own (by user_id); admins/owners see all; writes via service-role (edge function).
- CartDrawer primary button → /checkout. Legacy split (VS deep-link wine, simulated merch) kept under "Use legacy split checkout" accordion.
- Stripe pk: VITE_PAYMENTS_CLIENT_TOKEN. Server: STRIPE_SANDBOX_API_KEY / STRIPE_LIVE_API_KEY.

## Go-live checklist
1. Flip VS_SIMULATION=false in unified-checkout/index.ts.
2. Implement live VS call in finalize branch using _shared/vinoshipper.ts (post paid:true).
3. Add same VS API secrets as vinoshipper-create-order.
4. Decide tax + shipping calc (currently 0 in create-intent body).
