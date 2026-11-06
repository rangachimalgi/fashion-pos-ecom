-- 027: Incentives on sales above target, and employees seeing their own target.
-- Requires 025 + 026. Safe to re-run.
--
--   incentive = (sales above target) x incentive % / 100
--   e.g. target 3,00,000, sales 3,10,000, incentive 1% -> 10,000 above -> Rs 100
--   Below target there is no incentive.
--
-- * sales_targets gets an incentive % per person (default 1).
-- * An employee login is linked to a salesperson name, so the employee page
--   can show that person's salary, target and incentive.
-- * An employee can read ONLY their own figures, through my_target_progress().

-- ---------------------------------------------------------------------------
-- 1. Incentive % and the employee <-> salesperson link
-- ---------------------------------------------------------------------------

alter table public.sales_targets
  add column if not exists incentive_percent numeric(6, 2) not null default 1
  check (incentive_percent >= 0 and incentive_percent <= 100);

alter table public.employees
  add column if not exists sales_person_id uuid references public.sales_people (id) on delete set null;

-- One employee per salesperson name (otherwise two people would see the same figures).
create unique index if not exists employees_sales_person_unique
  on public.employees (sales_person_id)
  where sales_person_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Admin progress now includes the incentive (return type changes: drop first)
-- ---------------------------------------------------------------------------

drop function if exists public.sales_target_progress(date, text);

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
  bills bigint,
  incentive_percent numeric,
  incentive_amount numeric
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
  ),
  figures as (
    select sp.id as sp_id,
           sp.name as sp_name,
           sp.active as sp_active,
           st.monthly_salary as salary,
           st.target_percent as pct,
           st.incentive_percent as inc_pct,
           case when st.sales_person_id is null then null
                else round(st.monthly_salary * st.target_percent / 100, 2) end as target,
           coalesce(s.amount, 0) as achieved,
           coalesce(s.bills, 0) as bills
    from public.sales_people sp
    left join public.sales_targets st on st.sales_person_id = sp.id
    left join sold s on s.sp_id = sp.id
    where sp.active or s.sp_id is not null
  )
  select f.sp_id, f.sp_name, f.sp_active,
         f.salary::numeric, f.pct::numeric, f.target::numeric,
         f.achieved::numeric, f.bills::bigint,
         f.inc_pct::numeric,
         case when f.target is null then null
              else round(greatest(f.achieved - f.target, 0) * f.inc_pct / 100, 2) end::numeric
  from figures f
  order by f.sp_active desc, f.sp_name;
end;
$$;

revoke all on function public.sales_target_progress(date, text) from public, anon;
grant execute on function public.sales_target_progress(date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. An employee's own figures (always exactly one row)
-- ---------------------------------------------------------------------------
-- linked = false  -> the admin has not linked this login to a salesperson yet
-- target_amount is null when the admin has not entered a salary for them.

create or replace function public.my_target_progress(
  p_month date default null,
  p_timezone text default 'Asia/Kolkata'
)
returns table (
  linked boolean,
  month_start date,
  monthly_salary numeric,
  target_percent numeric,
  target_amount numeric,
  achieved numeric,
  bills bigint,
  incentive_percent numeric,
  incentive_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_emp uuid := public.current_employee_id();
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'Asia/Kolkata');
  v_sp uuid;
  v_first date;
  v_from timestamptz;
  v_to timestamptz;
  v_salary numeric;
  v_pct numeric;
  v_inc numeric;
  v_target numeric;
  v_achieved numeric := 0;
  v_bills bigint := 0;
begin
  if v_emp is null then
    raise exception 'This login is not an active employee account.' using errcode = 'PT403';
  end if;
  if not exists (select 1 from pg_timezone_names where pg_timezone_names.name = v_tz) then
    raise exception 'Unknown time zone' using errcode = 'PT400';
  end if;

  v_first := date_trunc('month', coalesce(p_month, (now() at time zone v_tz)::date))::date;
  v_from := v_first::timestamp at time zone v_tz;
  v_to := (v_first + interval '1 month')::timestamp at time zone v_tz;

  select e.sales_person_id into v_sp from public.employees e where e.id = v_emp;

  if v_sp is null then
    return query select false, v_first, null::numeric, null::numeric, null::numeric,
                        0::numeric, 0::bigint, null::numeric, null::numeric;
    return;
  end if;

  select st.monthly_salary, st.target_percent, st.incentive_percent
    into v_salary, v_pct, v_inc
  from public.sales_targets st
  where st.sales_person_id = v_sp;

  select coalesce(sum(o.total_amount), 0), count(*)
    into v_achieved, v_bills
  from public.orders o
  where o.source = 'POS'
    and o.sales_person_id = v_sp
    and o.created_at >= v_from
    and o.created_at < v_to;

  if v_salary is not null then
    v_target := round(v_salary * v_pct / 100, 2);
  end if;

  return query select true, v_first, v_salary, v_pct, v_target,
                      v_achieved::numeric, v_bills::bigint, v_inc,
                      case when v_target is null then null
                           else round(greatest(v_achieved - v_target, 0) * v_inc / 100, 2) end;
end;
$$;

revoke all on function public.my_target_progress(date, text) from public, anon;
grant execute on function public.my_target_progress(date, text) to authenticated;

notify pgrst, 'reload schema';
