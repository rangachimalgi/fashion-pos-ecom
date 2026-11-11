-- 029: Performance colour from sales targets.
-- Requires 026 + 027. Safe to re-run.
--
--   met the target in the last finished month      -> green
--   missed it 1 month                              -> yellow
--   missed it 2 (or more) months in a row          -> red
--   no target yet / not enough history             -> no colour ("none")
--
-- Rules, so nobody is marked down unfairly:
--   * Only finished months count. The month that is still running is never judged.
--   * A month is judged only if it started AFTER the month the target was first
--     set and after the month the person was added. (Setting a target today does
--     not turn last month's sales into a miss.)
--   * Months are measured against the salary and % saved today, same as the
--     Sales targets page.

alter table public.sales_targets
  add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- One person, one month: 'met', 'missed' or 'skip' (not judged).
-- Internal helper; only the two functions below call it.
-- ---------------------------------------------------------------------------

create or replace function public.target_month_result(
  p_sales_person_id uuid,
  p_month_first date,
  p_timezone text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target numeric;
  v_set_at timestamptz;
  v_joined_at timestamptz;
  v_from timestamptz;
  v_to timestamptz;
  v_achieved numeric;
begin
  select round(st.monthly_salary * st.target_percent / 100, 2), st.created_at, sp.created_at
    into v_target, v_set_at, v_joined_at
  from public.sales_targets st
  join public.sales_people sp on sp.id = st.sales_person_id
  where st.sales_person_id = p_sales_person_id;

  if v_target is null then
    return 'skip';
  end if;

  -- The month the target was set / the person joined is only partly theirs.
  if p_month_first <= date_trunc('month', v_set_at at time zone p_timezone)::date
     or p_month_first <= date_trunc('month', v_joined_at at time zone p_timezone)::date then
    return 'skip';
  end if;

  v_from := p_month_first::timestamp at time zone p_timezone;
  v_to := (p_month_first + interval '1 month')::timestamp at time zone p_timezone;

  select coalesce(sum(o.total_amount), 0)
    into v_achieved
  from public.orders o
  where o.source = 'POS'
    and o.sales_person_id = p_sales_person_id
    and o.created_at >= v_from
    and o.created_at < v_to;

  return case when v_achieved >= v_target then 'met' else 'missed' end;
end;
$$;

revoke all on function public.target_month_result(uuid, date, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Colour for everyone with a target (admin).
-- `p_month` is the month being looked at: a finished month is judged up to and
-- including itself; the running month is judged up to the month before it.
-- ---------------------------------------------------------------------------

create or replace function public.sales_performance(
  p_month date default null,
  p_timezone text default 'Asia/Kolkata'
)
returns table (
  sales_person_id uuid,
  standing text,
  missed_streak integer,
  judged_month date,
  last_result text,
  previous_result text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'Asia/Kolkata');
  v_cur date;
  v_sel date;
  v_last date;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view performance.' using errcode = 'PT403';
  end if;
  if not exists (select 1 from pg_timezone_names where pg_timezone_names.name = v_tz) then
    raise exception 'Unknown time zone' using errcode = 'PT400';
  end if;

  v_cur := date_trunc('month', now() at time zone v_tz)::date;
  v_sel := least(date_trunc('month', coalesce(p_month, v_cur))::date, v_cur);
  v_last := case when v_sel < v_cur then v_sel else (v_sel - interval '1 month')::date end;

  return query
  with r as (
    select st.sales_person_id as sp_id,
           public.target_month_result(st.sales_person_id, v_last, v_tz) as r1,
           public.target_month_result(st.sales_person_id, (v_last - interval '1 month')::date, v_tz) as r2
    from public.sales_targets st
  )
  select r.sp_id,
         case when r.r1 = 'met' then 'green'
              when r.r1 = 'missed' and r.r2 = 'missed' then 'red'
              when r.r1 = 'missed' then 'yellow'
              else 'none' end,
         case when r.r1 = 'missed' and r.r2 = 'missed' then 2
              when r.r1 = 'missed' then 1
              else 0 end,
         v_last,
         r.r1,
         r.r2
  from r;
end;
$$;

revoke all on function public.sales_performance(date, text) from public, anon;
grant execute on function public.sales_performance(date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The signed-in employee's own colour (one row).
-- ---------------------------------------------------------------------------

create or replace function public.my_performance(
  p_month date default null,
  p_timezone text default 'Asia/Kolkata'
)
returns table (
  standing text,
  missed_streak integer,
  judged_month date,
  last_result text,
  previous_result text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp uuid := public.current_employee_id();
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'Asia/Kolkata');
  v_sp uuid;
  v_cur date;
  v_sel date;
  v_last date;
  v_r1 text := 'skip';
  v_r2 text := 'skip';
begin
  if v_emp is null then
    raise exception 'This login is not an active employee account.' using errcode = 'PT403';
  end if;
  if not exists (select 1 from pg_timezone_names where pg_timezone_names.name = v_tz) then
    raise exception 'Unknown time zone' using errcode = 'PT400';
  end if;

  v_cur := date_trunc('month', now() at time zone v_tz)::date;
  v_sel := least(date_trunc('month', coalesce(p_month, v_cur))::date, v_cur);
  v_last := case when v_sel < v_cur then v_sel else (v_sel - interval '1 month')::date end;

  select e.sales_person_id into v_sp from public.employees e where e.id = v_emp;
  if v_sp is not null then
    v_r1 := public.target_month_result(v_sp, v_last, v_tz);
    v_r2 := public.target_month_result(v_sp, (v_last - interval '1 month')::date, v_tz);
  end if;

  return query select
    case when v_r1 = 'met' then 'green'
         when v_r1 = 'missed' and v_r2 = 'missed' then 'red'
         when v_r1 = 'missed' then 'yellow'
         else 'none' end,
    case when v_r1 = 'missed' and v_r2 = 'missed' then 2
         when v_r1 = 'missed' then 1
         else 0 end,
    v_last,
    v_r1,
    v_r2;
end;
$$;

revoke all on function public.my_performance(date, text) from public, anon;
grant execute on function public.my_performance(date, text) to authenticated;

notify pgrst, 'reload schema';
