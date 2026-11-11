-- 028: An admin can check an employee in or out, add or correct a day, or remove it.
-- Requires 024 + 025. Safe to re-run.
--
--   admin_check_in(employee)                        -> checks them in right now
--   admin_check_out(employee)                       -> checks them out right now
--   admin_set_attendance(employee, day, in, out)    -> any past or present day, times as HH:MM shop time
--   admin_delete_attendance(employee, day)          -> removes that day's record
--
-- Employees keep using employee_check_in / employee_check_out from 025. Every
-- row remembers whether an employee or an admin created it, and who last edited it.

alter table public.attendance
  add column if not exists source text not null default 'employee'
    check (source in ('employee', 'admin')),
  add column if not exists edited_by_email text,
  add column if not exists edited_at timestamptz;

-- ---------------------------------------------------------------------------
-- Check in / out right now
-- ---------------------------------------------------------------------------

create or replace function public.admin_check_in(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_in timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can do this.' using errcode = 'PT403';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'Employee not found.' using errcode = 'PT404';
  end if;

  insert into public.attendance (employee_id, work_date, source, edited_by_email, edited_at)
  values (
    p_employee_id,
    public.shop_today(),
    'admin',
    (select u.email from auth.users u where u.id = auth.uid()),
    now()
  )
  on conflict (employee_id, work_date) do nothing
  returning id, check_in into v_id, v_in;

  if v_id is null then
    raise exception 'Already checked in today.' using errcode = 'PT409';
  end if;

  return jsonb_build_object('attendance_id', v_id, 'check_in', v_in);
end;
$$;

create or replace function public.admin_check_out(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can do this.' using errcode = 'PT403';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'Employee not found.' using errcode = 'PT404';
  end if;

  update public.attendance
     set check_out = now(),
         edited_by_email = (select u.email from auth.users u where u.id = auth.uid()),
         edited_at = now()
   where employee_id = p_employee_id
     and work_date = public.shop_today()
     and check_out is null
  returning * into v_row;

  if v_row.id is null then
    if exists (
      select 1 from public.attendance
      where employee_id = p_employee_id and work_date = public.shop_today()
    ) then
      raise exception 'Already checked out today.' using errcode = 'PT409';
    end if;
    raise exception 'Not checked in today. Check them in first.' using errcode = 'PT409';
  end if;

  return jsonb_build_object('attendance_id', v_row.id, 'check_out', v_row.check_out);
end;
$$;

-- ---------------------------------------------------------------------------
-- Set a day by hand (new record, or correct an existing one)
-- ---------------------------------------------------------------------------
-- Times are HH:MM in shop time. Check-out may be empty (still in / forgot).

create or replace function public.admin_set_attendance(
  p_employee_id uuid,
  p_work_date date,
  p_check_in text,
  p_check_out text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in_text text := nullif(btrim(coalesce(p_check_in, '')), '');
  v_out_text text := nullif(btrim(coalesce(p_check_out, '')), '');
  v_in timestamptz;
  v_out timestamptz;
  v_id uuid;
  v_email text := (select u.email from auth.users u where u.id = auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Only an admin can do this.' using errcode = 'PT403';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'Employee not found.' using errcode = 'PT404';
  end if;
  if p_work_date is null then
    raise exception 'Choose the date.' using errcode = 'PT400';
  end if;
  if p_work_date > public.shop_today() then
    raise exception 'You cannot record attendance for a future day.' using errcode = 'PT400';
  end if;
  if p_work_date < public.shop_today() - 366 then
    raise exception 'That date is too far back.' using errcode = 'PT400';
  end if;

  if v_in_text is null or v_in_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Enter the check-in time as HH:MM.' using errcode = 'PT400';
  end if;
  if v_out_text is not null and v_out_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Enter the check-out time as HH:MM, or leave it empty.' using errcode = 'PT400';
  end if;

  v_in := ((p_work_date::text || ' ' || v_in_text)::timestamp) at time zone 'Asia/Kolkata';
  v_out := case when v_out_text is null then null
                else ((p_work_date::text || ' ' || v_out_text)::timestamp) at time zone 'Asia/Kolkata' end;

  if v_in > now() + interval '1 minute' then
    raise exception 'The check-in time is in the future.' using errcode = 'PT400';
  end if;
  if v_out is not null and v_out > now() + interval '1 minute' then
    raise exception 'The check-out time is in the future.' using errcode = 'PT400';
  end if;
  if v_out is not null and v_out < v_in then
    raise exception 'Check-out must be after check-in.' using errcode = 'PT400';
  end if;

  insert into public.attendance (employee_id, work_date, check_in, check_out, source, edited_by_email, edited_at)
  values (p_employee_id, p_work_date, v_in, v_out, 'admin', v_email, now())
  on conflict (employee_id, work_date) do update
    set check_in = excluded.check_in,
        check_out = excluded.check_out,
        edited_by_email = excluded.edited_by_email,
        edited_at = excluded.edited_at
  returning id into v_id;

  return jsonb_build_object('attendance_id', v_id);
end;
$$;

create or replace function public.admin_delete_attendance(p_employee_id uuid, p_work_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can do this.' using errcode = 'PT403';
  end if;

  delete from public.attendance
  where employee_id = p_employee_id and work_date = p_work_date;

  if not found then
    raise exception 'There is no attendance to remove for that day.' using errcode = 'PT404';
  end if;
end;
$$;

revoke all on function public.admin_check_in(uuid) from public, anon;
revoke all on function public.admin_check_out(uuid) from public, anon;
revoke all on function public.admin_set_attendance(uuid, date, text, text) from public, anon;
revoke all on function public.admin_delete_attendance(uuid, date) from public, anon;
grant execute on function public.admin_check_in(uuid) to authenticated;
grant execute on function public.admin_check_out(uuid) to authenticated;
grant execute on function public.admin_set_attendance(uuid, date, text, text) to authenticated;
grant execute on function public.admin_delete_attendance(uuid, date) to authenticated;

notify pgrst, 'reload schema';
