-- 030: Employees can check in only when they are at the shop.
-- Requires 024 + 025 (and 028 is fine either way). Safe to re-run.
--
-- The admin saves the shop's position and a radius (Attendance page). While the
-- check is ON, employee_check_in() needs the phone's position and refuses when it is
-- farther than the radius. The distance is worked out here in the database, so a
-- changed web page cannot skip it. It is OFF until an admin turns it on.
--
-- Honest limit: a website only receives the position the phone reports. Someone who
-- fakes their GPS can still pass. Every check-in stores its position and distance so
-- the admin can see odd ones.

-- ---------------------------------------------------------------------------
-- 1. Shop location (one row, admin only, read through functions)
-- ---------------------------------------------------------------------------

create table if not exists public.attendance_location (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  radius_m integer not null default 50 check (radius_m between 10 and 5000),
  max_accuracy_m integer not null default 150 check (max_accuracy_m between 20 and 2000),
  updated_at timestamptz not null default now(),
  check (not enabled or (latitude is not null and longitude is not null))
);

insert into public.attendance_location (id) values (true) on conflict (id) do nothing;

alter table public.attendance_location enable row level security;
revoke all on public.attendance_location from anon, authenticated;

alter table public.attendance
  add column if not exists check_in_lat double precision,
  add column if not exists check_in_lng double precision,
  add column if not exists check_in_accuracy_m numeric(8, 1),
  add column if not exists check_in_distance_m integer;

-- ---------------------------------------------------------------------------
-- 2. Admin: read / change the setting
-- ---------------------------------------------------------------------------

create or replace function public.get_attendance_location()
returns table (
  enabled boolean,
  latitude double precision,
  longitude double precision,
  radius_m integer,
  max_accuracy_m integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view this.' using errcode = 'PT403';
  end if;
  return query
    select l.enabled, l.latitude, l.longitude, l.radius_m, l.max_accuracy_m
    from public.attendance_location l
    where l.id;
end;
$$;

create or replace function public.set_attendance_location(
  p_enabled boolean,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_m integer,
  p_max_accuracy_m integer default 150
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change this.' using errcode = 'PT403';
  end if;
  if p_enabled is null then
    raise exception 'Choose on or off.' using errcode = 'PT400';
  end if;
  if p_latitude is not null and p_latitude not between -90 and 90 then
    raise exception 'Latitude must be between -90 and 90.' using errcode = 'PT400';
  end if;
  if p_longitude is not null and p_longitude not between -180 and 180 then
    raise exception 'Longitude must be between -180 and 180.' using errcode = 'PT400';
  end if;
  if p_enabled and (p_latitude is null or p_longitude is null) then
    raise exception 'Set the shop location before turning the check on.' using errcode = 'PT400';
  end if;
  if p_radius_m is null or p_radius_m not between 10 and 5000 then
    raise exception 'The distance must be between 10 and 5000 metres.' using errcode = 'PT400';
  end if;
  if p_max_accuracy_m is null or p_max_accuracy_m not between 20 and 2000 then
    raise exception 'The accuracy limit must be between 20 and 2000 metres.' using errcode = 'PT400';
  end if;

  update public.attendance_location
     set enabled = p_enabled,
         latitude = p_latitude,
         longitude = p_longitude,
         radius_m = p_radius_m,
         max_accuracy_m = p_max_accuracy_m,
         updated_at = now()
   where id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. What an employee's phone needs to know (no coordinates)
-- ---------------------------------------------------------------------------

create or replace function public.attendance_location_rules()
returns table (enabled boolean, radius_m integer)
language sql
stable
security definer
set search_path = public
as $$
  select l.enabled, l.radius_m from public.attendance_location l where l.id;
$$;

-- ---------------------------------------------------------------------------
-- 4. Check-in now takes the phone's position
-- ---------------------------------------------------------------------------
-- Replaces the no-argument version from 025 (calling it with no arguments still
-- works while the check is off).

drop function if exists public.employee_check_in();

create or replace function public.employee_check_in(
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := public.current_employee_id();
  v_loc public.attendance_location;
  v_dist double precision;
  v_id uuid;
  v_in timestamptz;
begin
  if v_emp is null then
    raise exception 'This login is not an active employee account.' using errcode = 'PT403';
  end if;

  select * into v_loc from public.attendance_location where id;

  if found
     and v_loc.latitude is not null and v_loc.longitude is not null
     and p_lat is not null and p_lng is not null
     and p_lat between -90 and 90 and p_lng between -180 and 180 then
    -- Haversine distance in metres (stored even when the check is off).
    v_dist := 2 * 6371000 * asin(least(1, sqrt(
      power(sin(radians(p_lat - v_loc.latitude) / 2), 2)
      + cos(radians(v_loc.latitude)) * cos(radians(p_lat))
        * power(sin(radians(p_lng - v_loc.longitude) / 2), 2)
    )));
  end if;

  if found and v_loc.enabled then
    if p_lat is null or p_lng is null
       or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'Your location is needed to check in. Allow location access and try again.'
        using errcode = 'PT400';
    end if;
    if p_accuracy is not null and p_accuracy > v_loc.max_accuracy_m then
      raise exception 'Your location is not precise enough (about % m). Go near a window or open area, switch on precise location and try again.',
        round(p_accuracy) using errcode = 'PT400';
    end if;
    if v_dist is null or v_dist > v_loc.radius_m then
      raise exception 'You are about % m from the shop. You can check in only within % m of it.',
        coalesce(round(v_dist), 0), v_loc.radius_m using errcode = 'PT403';
    end if;
  end if;

  insert into public.attendance (
    employee_id, work_date,
    check_in_lat, check_in_lng, check_in_accuracy_m, check_in_distance_m
  )
  values (
    v_emp, public.shop_today(),
    case when p_lat between -90 and 90 then p_lat end,
    case when p_lng between -180 and 180 then p_lng end,
    case when p_accuracy between 0 and 99999 then round(p_accuracy::numeric, 1) end,
    case when v_dist is not null then round(v_dist)::integer end
  )
  on conflict (employee_id, work_date) do nothing
  returning id, check_in into v_id, v_in;

  if v_id is null then
    raise exception 'You have already checked in today.' using errcode = 'PT409';
  end if;

  return jsonb_build_object('attendance_id', v_id, 'check_in', v_in);
end;
$$;

revoke all on function public.get_attendance_location() from public, anon;
revoke all on function public.set_attendance_location(boolean, double precision, double precision, integer, integer) from public, anon;
revoke all on function public.attendance_location_rules() from public, anon;
revoke all on function public.employee_check_in(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_attendance_location() to authenticated;
grant execute on function public.set_attendance_location(boolean, double precision, double precision, integer, integer) to authenticated;
grant execute on function public.attendance_location_rules() to authenticated;
grant execute on function public.employee_check_in(double precision, double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
