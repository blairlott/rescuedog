ALTER TABLE public.order_items
  ADD COLUMN cost_cents INTEGER,
  ADD COLUMN partner_kind TEXT CHECK (partner_kind IN ('vinoshipper','dropship','self','none')),
  ADD COLUMN partner_id TEXT;

ALTER TABLE public.orders
  ADD COLUMN stripe_fee_cents INTEGER,
  ADD COLUMN processor_net_cents INTEGER;

CREATE INDEX idx_order_items_partner ON public.order_items(partner_kind, partner_id);

-- Convenience view for margin reporting
CREATE OR REPLACE VIEW public.order_margin_v AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.created_at,
  o.payment_status,
  o.total_cents AS gross_cents,
  COALESCE(o.stripe_fee_cents, 0) AS stripe_fee_cents,
  COALESCE(SUM(oi.cost_cents * oi.quantity), 0)::INTEGER AS cogs_cents,
  (o.total_cents
    - COALESCE(o.stripe_fee_cents, 0)
    - COALESCE(SUM(oi.cost_cents * oi.quantity), 0)
  )::INTEGER AS gross_margin_cents,
  CASE WHEN o.total_cents > 0 THEN
    ROUND(
      (o.total_cents - COALESCE(o.stripe_fee_cents,0) - COALESCE(SUM(oi.cost_cents*oi.quantity),0))::numeric
      / o.total_cents::numeric * 100,
      2
    )
  ELSE NULL END AS margin_pct
FROM public.orders o
LEFT JOIN public.order_items oi ON oi.order_id = o.id
GROUP BY o.id;

ALTER VIEW public.order_margin_v SET (security_invoker = on);