-- POS cash desk: staff can see how much is in the till, not the note-by-note drawer.

create or replace function public.cash_drawer_total()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  return coalesce(
    (select sum(denomination * quantity)::integer from public.cash_drawer),
    0
  );
end;
$$;

revoke all on function public.cash_drawer_total() from public, anon;
grant execute on function public.cash_drawer_total() to authenticated;
