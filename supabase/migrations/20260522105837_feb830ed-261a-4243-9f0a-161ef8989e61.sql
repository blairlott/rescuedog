-- Helpers
CREATE OR REPLACE FUNCTION public.is_cfo(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'cfo')
$$;

CREATE OR REPLACE FUNCTION public.can_view_finance(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('owner','admin','executive','cfo','viewer')
  )
$$;

-- Dashboard layout per user
CREATE TABLE public.cfo_dashboard_layouts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  date_range_days integer NOT NULL DEFAULT 90,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cfo_dashboard_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own layout select" ON public.cfo_dashboard_layouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own layout insert" ON public.cfo_dashboard_layouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own layout update" ON public.cfo_dashboard_layouts FOR UPDATE USING (auth.uid() = user_id);

-- QB connection stub
CREATE TABLE public.finance_qb_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id text NOT NULL,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  connected_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_qb_connection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin select qb" ON public.finance_qb_connection FOR SELECT USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "admin write qb" ON public.finance_qb_connection FOR ALL USING (public.is_admin_or_owner(auth.uid())) WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Reporting RPCs
CREATE OR REPLACE FUNCTION public.finance_pnl_summary(_start date, _end date)
RETURNS TABLE(entry_type text, total_cents bigint, txn_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'permission denied'; END IF;
  RETURN QUERY
  SELECT e.entry_type, COALESCE(SUM(e.amount_cents),0)::bigint, COUNT(*)::bigint
  FROM public.bm_finance_entries e
  WHERE e.date BETWEEN _start AND _end
  GROUP BY e.entry_type
  ORDER BY 2 DESC;
END $$;

CREATE OR REPLACE FUNCTION public.finance_revenue_by_channel(_start date, _end date)
RETURNS TABLE(channel text, revenue_cents bigint, orders bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'permission denied'; END IF;
  RETURN QUERY
  SELECT COALESCE(e.channel,'(unspecified)') AS channel,
         COALESCE(SUM(e.amount_cents),0)::bigint,
         COUNT(*)::bigint
  FROM public.bm_finance_entries e
  WHERE e.date BETWEEN _start AND _end AND e.entry_type = 'revenue'
  GROUP BY 1
  ORDER BY 2 DESC;
END $$;

CREATE OR REPLACE FUNCTION public.finance_spend_by_platform(_start date, _end date)
RETURNS TABLE(platform text, spend_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'permission denied'; END IF;
  RETURN QUERY
  SELECT
    CASE
      WHEN e.subcategory = 'meta_ads' THEN 'Meta'
      WHEN e.subcategory = 'google_ads' THEN 'Google'
      WHEN e.subcategory = 'instacart_ads' THEN 'Instacart'
      ELSE COALESCE(e.subcategory, e.category, 'Other')
    END AS platform,
    COALESCE(SUM(e.amount_cents),0)::bigint
  FROM public.bm_finance_entries e
  WHERE e.date BETWEEN _start AND _end
    AND e.entry_type = 'expense'
    AND (lower(coalesce(e.category,'')) ~ '(ad|advert|marketing)' OR e.subcategory IN ('meta_ads','google_ads','instacart_ads'))
  GROUP BY 1
  ORDER BY 2 DESC;
END $$;

CREATE OR REPLACE FUNCTION public.finance_cash_trend(_start date, _end date, _bucket text DEFAULT 'week')
RETURNS TABLE(bucket_start date, cash_in_cents bigint, cash_out_cents bigint, net_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _trunc text;
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'permission denied'; END IF;
  _trunc := CASE WHEN _bucket IN ('day','week','month') THEN _bucket ELSE 'week' END;
  RETURN QUERY EXECUTE format($f$
    SELECT date_trunc(%L, e.date)::date AS bucket_start,
      COALESCE(SUM(CASE WHEN e.entry_type IN ('revenue') THEN e.amount_cents ELSE 0 END),0)::bigint,
      COALESCE(SUM(CASE WHEN e.entry_type IN ('expense','cogs','refund') THEN e.amount_cents ELSE 0 END),0)::bigint,
      COALESCE(SUM(CASE WHEN e.entry_type IN ('revenue') THEN e.amount_cents
                        WHEN e.entry_type IN ('expense','cogs','refund') THEN -e.amount_cents
                        ELSE 0 END),0)::bigint
    FROM public.bm_finance_entries e
    WHERE e.date BETWEEN %L AND %L
    GROUP BY 1 ORDER BY 1
  $f$, _trunc, _start, _end);
END $$;

CREATE OR REPLACE FUNCTION public.finance_top_vendors(_start date, _end date, _limit integer DEFAULT 10)
RETURNS TABLE(vendor text, category text, spend_cents bigint, txn_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'permission denied'; END IF;
  RETURN QUERY
  SELECT COALESCE(NULLIF(trim(e.vendor),''),'(unspecified)'),
         COALESCE(e.category,'(uncategorized)'),
         COALESCE(SUM(e.amount_cents),0)::bigint,
         COUNT(*)::bigint
  FROM public.bm_finance_entries e
  WHERE e.date BETWEEN _start AND _end
    AND e.entry_type IN ('expense','cogs')
  GROUP BY 1,2
  ORDER BY 3 DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
END $$;

CREATE OR REPLACE FUNCTION public.finance_vs_summary(_start date, _end date)
RETURNS TABLE(order_count bigint, revenue_cents bigint, aov_cents bigint, wine_club_cents bigint, ala_carte_cents bigint, wholesale_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'permission denied'; END IF;
  RETURN QUERY
  SELECT COUNT(*)::bigint,
         COALESCE(SUM(t.total_cents),0)::bigint,
         CASE WHEN COUNT(*) > 0 THEN (COALESCE(SUM(t.total_cents),0)/COUNT(*))::bigint ELSE 0 END,
         COALESCE(SUM(t.total_cents) FILTER (WHERE upper(t.order_type) = 'WINE_CLUB'),0)::bigint,
         COALESCE(SUM(t.total_cents) FILTER (WHERE upper(t.order_type) NOT IN ('WINE_CLUB','WHOLESALE')),0)::bigint,
         COALESCE(SUM(t.total_cents) FILTER (WHERE upper(t.order_type) = 'WHOLESALE'),0)::bigint
  FROM public.vs_transactions t
  WHERE t.transaction_date::date BETWEEN _start AND _end;
END $$;
