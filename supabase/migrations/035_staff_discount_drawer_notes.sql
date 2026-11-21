-- 035: Staff POS discount cap 2% -> 10%, and staff can see how many of each
-- note/coin is in the till (the POS shows it next to the cash desk).
-- Editing the drawer stays admin-only. Safe to re-run.

create or replace function public.discount_cap_percent(p_role text)
returns numeric
language sql
immutable
as $$
  select case p_role
    when 'admin' then 100
    when 'manager' then 5
    when 'staff' then 10
    else 0
  end;
$$;

revoke all on function public.discount_cap_percent(text) from public;
grant execute on function public.discount_cap_percent(text) to authenticated, service_role;

create or replace function public.cash_drawer_breakdown()
returns table (denomination integer, quantity integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  return query
    select d.denomination::integer, d.quantity::integer
    from public.cash_drawer d
    order by d.denomination desc;
end;
$$;

revoke all on function public.cash_drawer_breakdown() from public, anon;
grant execute on function public.cash_drawer_breakdown() to authenticated;
