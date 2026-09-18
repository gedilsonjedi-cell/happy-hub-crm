create or replace function public.get_redirect_link_stats(_link_ids uuid[])
returns table (link_id uuid, clicks_today bigint, clicks_week bigint, clicks_month bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.link_id,
    count(*) filter (where c.clicked_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as clicks_today,
    count(*) filter (where c.clicked_at >= date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as clicks_week,
    count(*) filter (where c.clicked_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as clicks_month
  from public.redirect_link_clicks c
  join public.redirect_links rl on rl.id = c.link_id
  where c.link_id = any(_link_ids)
    and c.clicked_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    and (rl.organization_id = public.get_user_organization_id(auth.uid()) or public.is_super_admin(auth.uid()))
  group by c.link_id
$$;

revoke all on function public.get_redirect_link_stats(uuid[]) from public;
grant execute on function public.get_redirect_link_stats(uuid[]) to authenticated;