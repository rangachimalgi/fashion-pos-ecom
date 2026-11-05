-- 025: Employees, attendance (check in / check out) and leave requests.
-- Requires 013 + 014 + 024. Safe to re-run.
--
-- * An employee is NOT a POS user. They sign in with their own login (created
--   by an admin from the admin panel) and have no row in public.profiles, so
--   they cannot open the POS or the admin panel and every staff-only table
--   stays closed to them.
-- * Admin creates / edits / deletes employees through the app server (it needs
--   the service key to create the login), so there are no insert / update /
--   delete policies here. Only an admin can READ the employees table (it holds
--   Aadhaar and PAN numbers).
-- * Employees check in / out and ask for leave through the functions below;
--   times always come from the database clock, never from the phone.
-- * "Today" is the shop's day (Asia/Kolkata).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  -- The employee's login. Set null (not cascade) so deleting a login by hand
  -- never silently deletes their records.
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text not null check (phone ~ '^[0-9]{10}$'),
  address text not null check (char_length(btrim(address)) between 3 and 300),
  aadhaar text check (aadhaar is null or aadhaar ~ '^[0-9]{12}$'),
  pan text check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employees_phone_unique on public.employees (phone);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  check_in timestamptz not null default now(),
  check_out timestamptz,
  unique (employee_id, work_date),
  check (check_out is null or check_out >= check_in)
);

create index if not exists attendance_date_idx on public.attendance (work_date);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_by_email text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (to_date >= from_date)
);

create index if not exists leave_requests_employee_idx on public.leave_requests (employee_id, from_date);
create index if not exists leave_requests_status_idx on public.leave_requests (status);

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- The shop's calendar day right now.
create or replace function public.shop_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

-- The signed-in user's employee id (only while the employee is active).
create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  where e.user_id = auth.uid()
    and e.active;
$$;

revoke all on function public.current_employee_id() from public, anon;
grant execute on function public.current_employee_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Access: admin reads everything, an employee reads only their own rows
-- ---------------------------------------------------------------------------

alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;

drop policy if exists employees_admin_read on public.employees;
drop policy if exists attendance_admin_read on public.attendance;
drop policy if exists attendance_own_read on public.attendance;
drop policy if exists leave_admin_read on public.leave_requests;
drop policy if exists leave_own_read on public.leave_requests;

create policy employees_admin_read on public.employees
  for select to authenticated using (public.is_admin());

create policy attendance_admin_read on public.attendance
  for select to authenticated using (public.is_admin());
create policy attendance_own_read on public.attendance
  for select to authenticated using (employee_id = public.current_employee_id());

create policy leave_admin_read on public.leave_requests
  for select to authenticated using (public.is_admin());
create policy leave_own_read on public.leave_requests
  for select to authenticated using (employee_id = public.current_employee_id());

-- No direct writes from the browser at all.
revoke all on public.employees from anon, authenticated;
revoke all on public.attendance from anon, authenticated;
revoke all on public.leave_requests from anon, authenticated;
grant select on public.employees to authenticated;
grant select on public.attendance to authenticated;
grant select on public.leave_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Employee functions
-- ---------------------------------------------------------------------------

-- Who am I? Used by the employee page. Never returns Aadhaar / PAN.
create or replace function public.my_employee()
returns table (id uuid, name text, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.name, e.phone
  from public.employees e
  where e.user_id = auth.uid()
    and e.active;
$$;

revoke all on function public.my_employee() from public, anon;
grant execute on function public.my_employee() to authenticated;

create or replace function public.employee_check_in()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := public.current_employee_id();
  v_id uuid;
  v_in timestamptz;
begin
  if v_emp is null then
    raise exception 'This login is not an active employee account.' using errcode = 'PT403';
  end if;

  insert into public.attendance (employee_id, work_date)
  values (v_emp, public.shop_today())
  on conflict (employee_id, work_date) do nothing
  returning id, check_in into v_id, v_in;

  if v_id is null then
    raise exception 'You have already checked in today.' using errcode = 'PT409';
  end if;

  return jsonb_build_object('attendance_id', v_id, 'check_in', v_in);
end;
$$;

create or replace function public.employee_check_out()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := public.current_employee_id();
  v_row public.attendance;
begin
  if v_emp is null then
    raise exception 'This login is not an active employee account.' using errcode = 'PT403';
  end if;

  update public.attendance
     set check_out = now()
   where employee_id = v_emp
     and work_date = public.shop_today()
     and check_out is null
  returning * into v_row;

  if v_row.id is null then
    if exists (
      select 1 from public.attendance
      where employee_id = v_emp and work_date = public.shop_today()
    ) then
      raise exception 'You have already checked out today.' using errcode = 'PT409';
    end if;
    raise exception 'You have not checked in today.' using errcode = 'PT409';
  end if;

  return jsonb_build_object('attendance_id', v_row.id, 'check_out', v_row.check_out);
end;
$$;

create or replace function public.request_leave(p_from date, p_to date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := public.current_employee_id();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if v_emp is null then
    raise exception 'This login is not an active employee account.' using errcode = 'PT403';
  end if;
  if p_from is null or p_to is null then
    raise exception 'Choose the first and last day of your leave.' using errcode = 'PT400';
  end if;
  if p_to < p_from then
    raise exception 'The last day is before the first day.' using errcode = 'PT400';
  end if;
  if p_from < public.shop_today() then
    raise exception 'Leave must start today or later.' using errcode = 'PT400';
  end if;
  if p_to - p_from > 60 then
    raise exception 'A leave request can be at most 60 days.' using errcode = 'PT400';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Give a reason (3 to 500 characters).' using errcode = 'PT400';
  end if;

  -- Serialise one employee's requests so two taps cannot both pass the overlap check.
  perform 1 from public.employees where id = v_emp for update;

  if exists (
    select 1
    from public.leave_requests l
    where l.employee_id = v_emp
      and l.status in ('pending', 'approved')
      and l.from_date <= p_to
      and l.to_date >= p_from
  ) then
    raise exception 'You already have a leave request for some of these days.' using errcode = 'PT409';
  end if;

  insert into public.leave_requests (employee_id, from_date, to_date, reason)
  values (v_emp, p_from, p_to, v_reason)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.cancel_leave(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := public.current_employee_id();
  v_status text;
begin
  if v_emp is null then
    raise exception 'This login is not an active employee account.' using errcode = 'PT403';
  end if;

  select status into v_status
  from public.leave_requests
  where id = p_id and employee_id = v_emp
  for update;

  if not found then
    raise exception 'Leave request not found.' using errcode = 'PT404';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only a pending request can be cancelled (this one is %).', v_status
      using errcode = 'PT409';
  end if;

  update public.leave_requests set status = 'cancelled' where id = p_id;
end;
$$;

revoke all on function public.employee_check_in() from public, anon;
revoke all on function public.employee_check_out() from public, anon;
revoke all on function public.request_leave(date, date, text) from public, anon;
revoke all on function public.cancel_leave(uuid) from public, anon;
grant execute on function public.employee_check_in() to authenticated;
grant execute on function public.employee_check_out() to authenticated;
grant execute on function public.request_leave(date, date, text) to authenticated;
grant execute on function public.cancel_leave(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin: approve or reject leave
-- ---------------------------------------------------------------------------

create or replace function public.decide_leave(
  p_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only an admin can approve or reject leave.' using errcode = 'PT403';
  end if;
  if p_approve is null then
    raise exception 'Choose approve or reject.' using errcode = 'PT400';
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'The note can be at most 300 characters.' using errcode = 'PT400';
  end if;

  select status into v_status
  from public.leave_requests
  where id = p_id
  for update;

  if not found then
    raise exception 'Leave request not found.' using errcode = 'PT404';
  end if;
  if v_status <> 'pending' then
    raise exception 'This request is already %.', v_status using errcode = 'PT409';
  end if;

  update public.leave_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = v_note,
         decided_by = auth.uid(),
         decided_by_email = (select u.email from auth.users u where u.id = auth.uid()),
         decided_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.decide_leave(uuid, boolean, text) from public, anon;
grant execute on function public.decide_leave(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
