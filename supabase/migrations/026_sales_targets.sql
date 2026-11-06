-- 026: Monthly sales targets per salesperson, based on salary.
-- Requires 013 + 014 + 016 + 024. Safe to re-run.
--
--   monthly target = monthly salary x target % / 100
--   e.g. salary 20,000 at 1500% -> target 3,00,000 a month
--
-- Salary lives in its OWN table, readable by admins only. Do not add it to
-- sales_people: every POS user can read that table (it fills the "Attended by"
-- list), so a salary column there would be visible to the whole shop.

create table if not exists public.sales_targets (
  sales_person_id uuid primary key references public.sales_people (id) on delete cascade,
  monthly_salary numeric(12, 2) not null check (monthly_salary >= 0 and monthly_salary <= 10000000),
  target_percent numeric(8, 2) not null default 1500 check (target_percent >= 0 and target_percent <= 100000),
  updated_at timestamptz not null default now()
);

alter table public.sales_targets enable row level security;

drop policy if exists sales_targets_admin_read on public.sales_targets;
drop policy if exists sales_targets_admin_insert on public.sales_targets;
drop policy if exists sales_targets_admin_update on public.sales_targets;
drop policy if exists sales_targets_admin_delete on public.sales_targets;

create policy sales_targets_admin_read on public.sales_targets
  for select to authenticated using (public.is_admin());
create policy sales_targets_admin_insert on public.sales_targets
  for insert to authenticated with check (public.is_admin());
create policy sales_targets_admin_update on public.sales_targets
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sales_targets_admin_delete on public.sales_targets
  for delete to authenticated using (public.is_admin());

revoke all on public.sales_targets from anon;
grant select, insert, update, delete on public.sales_targets to authenticated;

-- ---------------------------------------------------------------------------
-- Progress for one month (shop time zone), one row per salesperson.
-- Lists everyone who is active, plus inactive people who sold that month.
-- Sales = POS bills attended by that person (same basis as sales_by_person).
-- ---------------------------------------------------------------------------

create or replace function public.sales_target_progress(
  p_month date default null,
  p_timezone text default 'Asia/Kolkata'
)
returns table (
  sales_person_id uuid,
  name text,
  active boolean,
  monthly_salary numeric,
  target_percent numeric,
  target_amount numeric,
  achieved numeric,
  bills bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'Asia/Kolkata');
  v_first date;
  v_from timestamptz;
  v_to timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view targets.' using errcode = 'PT403';
  end if;
  if not exists (select 1 from pg_timezone_names where pg_timezone_names.name = v_tz) then
    raise exception 'Unknown time zone' using errcode = 'PT400';
  end if;

  v_first := date_trunc('month', coalesce(p_month, (now() at time zone v_tz)::date))::date;
  v_from := v_first::timestamp at time zone v_tz;
  v_to := (v_first + interval '1 month')::timestamp at time zone v_tz;

  return query
  with sold as (
    select o.sales_person_id as sp_id,
           count(*)::bigint as bills,
           coalesce(sum(o.total_amount), 0)::numeric as amount
    from public.orders o
    where o.source = 'POS'
      and o.sales_person_id is not null
      and o.created_at >= v_from
      and o.created_at < v_to
    group by o.sales_person_id
  )
  select sp.id,
         sp.name,
         sp.active,
         st.monthly_salary::numeric,
         st.target_percent::numeric,
         case when st.sales_person_id is null then null
              else round(st.monthly_salary * st.target_percent / 100, 2)::numeric end,
         coalesce(s.amount, 0)::numeric,
         coalesce(s.bills, 0)::bigint
  from public.sales_people sp
  left join public.sales_targets st on st.sales_person_id = sp.id
  left join sold s on s.sp_id = sp.id
  where sp.active or s.sp_id is not null
  order by sp.active desc, sp.name;
end;
$$;

revoke all on function public.sales_target_progress(date, text) from public, anon;
grant execute on function public.sales_target_progress(date, text) to authenticated;

notify pgrst, 'reload schema';
