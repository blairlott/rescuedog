ALTER TABLE public.kennel_keyword_settings ALTER COLUMN auto_apply SET DEFAULT true;
UPDATE public.kennel_keyword_settings SET auto_apply = true WHERE auto_apply = false;
UPDATE public.ad_settings
  SET value = jsonb_set(value, '{auto_apply}', 'true'::jsonb, true)
  WHERE (key LIKE 'channel_controls_%' OR key LIKE 'strategy_mix%')
    AND COALESCE((value->>'auto_apply')::boolean, false) = false;