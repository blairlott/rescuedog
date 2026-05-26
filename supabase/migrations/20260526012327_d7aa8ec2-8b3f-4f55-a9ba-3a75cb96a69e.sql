alter table public.ads_performance
  alter column ad_group_id set default '',
  alter column ad_id set default '';
update public.ads_performance set ad_group_id = '' where ad_group_id is null;
update public.ads_performance set ad_id = '' where ad_id is null;
alter table public.ads_performance
  alter column ad_group_id set not null,
  alter column ad_id set not null;
drop index if exists public.ads_perf_uniq;
alter table public.ads_performance
  add constraint ads_perf_uniq unique (account_id, date, campaign_id, ad_group_id, ad_id);