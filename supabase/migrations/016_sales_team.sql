-- 016: Sales team ("attended by") and per-person sales report.
-- Requires 013 + 014 + 015. Safe to re-run.
--
-- * Admin manages the list of salespeople (add / rename / deactivate).
-- * Every POS bill records who attended the customer.
-- * Admin can see bills, pieces and sales per person for any period.
--
-- Rollout note: until at least one ACTIVE salesperson exists, POS bills are
-- accepted without one (so billing never stops on deploy day). As soon as the
-- admin adds a name, every new POS bill must pick one.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.sales_people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists sales_people_name_unique
  on public.sales_people (lower(btrim(name)));

alter table public.sales_people enable row level security;

drop policy if exists sales_people_staff_read on public.sales_people;
drop policy if exists sales_people_admin_insert on public.sales_people;
drop policy if exists sales_people_admin_update on public.sales_people;
drop policy if exists sales_people_admin_delete on public.sales_people;

create policy sales_people_staff_read on public.sales_people
  for select to authenticated using (public.is_staff());
create policy sales_people_admin_insert on public.sales_people
  for insert to authenticated with check (public.is_admin());
create policy sales_people_admin_update on public.sales_people
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sales_people_admin_delete on public.sales_people
  for delete to authenticated using (public.is_admin());

revoke all on public.sales_people from anon;

-- ---------------------------------------------------------------------------
-- 2. Who attended each bill
-- ---------------------------------------------------------------------------
-- restrict: a salesperson who has bills cannot be deleted (deactivate instead).
-- attended_by_name keeps the name as it was on the bill, even after a rename.

alter table public.orders
  add column if not exists sales_person_id uuid references public.sales_people (id) on delete restrict,
  add column if not exists attended_by_name text;

create index if not exists orders_sales_person_idx
  on public.orders (sales_person_id)
  where sales_person_id is not null;

-- ---------------------------------------------------------------------------
-- 3. place_order / update_pos_order now take the salesperson
-- ---------------------------------------------------------------------------
-- New parameter => new signature. Drop the old ones, otherwise a call without
-- the new argument would match both and fail as ambiguous.

drop function if exists public.place_order(text, text, jsonb, jsonb);
drop function if exists public.update_pos_order(uuid, text, jsonb);

create or replace function public.place_order(
  p_payment_method text,
  p_source text,
  p_items jsonb,
  p_shipping jsonb default null,
  p_sales_person_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_total numeric;
  v_name text;
  v_phone text;
  v_line1 text;
  v_line2 text;
  v_city text;
  v_state text;
  v_pincode text;
  v_sales_person_id uuid;
  v_sales_name text;
begin
  if p_payment_method is null or p_payment_method not in ('CASH', 'UPI') then
    raise exception 'payment_method must be CASH or UPI' using errcode = 'PT400';
  end if;

  if p_source is null or p_source not in ('ONLINE', 'POS') then
    raise exception 'source must be ONLINE or POS' using errcode = 'PT400';
  end if;

  if p_source = 'POS' and not public.is_staff() then
    raise exception 'Staff sign-in required to post POS bills' using errcode = '42501';
  end if;

  perform public._validate_order_lines(p_items);

  if p_source = 'POS' then
    if p_sales_person_id is not null then
      select sp.id, sp.name
        into v_sales_person_id, v_sales_name
      from public.sales_people sp
      where sp.id = p_sales_person_id and sp.active;
      if not found then
        raise exception 'That salesperson is not available. Pick someone from the list.'
          using errcode = 'PT400';
      end if;
    elsif exists (select 1 from public.sales_people where active) then
      raise exception 'Choose who attended this customer.' using errcode = 'PT400';
    end if;
  end if;

  if p_source = 'ONLINE' then
    if p_shipping is null or jsonb_typeof(p_shipping) <> 'object' then
      raise exception 'Add a delivery name, phone, and address.' using errcode = 'PT400';
    end if;

    v_name := btrim(coalesce(p_shipping->>'customer_name', ''));
    v_phone := right(regexp_replace(coalesce(p_shipping->>'customer_phone', ''), '\D', '', 'g'), 10);
    v_line1 := btrim(coalesce(p_shipping->>'address_line1', ''));
    v_line2 := btrim(coalesce(p_shipping->>'address_line2', ''));
    v_city := btrim(coalesce(p_shipping->>'city', ''));
    v_state := btrim(coalesce(p_shipping->>'state', ''));
    v_pincode := btrim(coalesce(p_shipping->>'pincode', ''));

    if char_length(v_name) < 2 then
      raise exception 'Enter the full name for delivery.' using errcode = 'PT400';
    end if;
    if v_phone !~ '^[6-9][0-9]{9}$' then
      raise exception 'Enter a valid 10-digit Indian mobile number.' using errcode = 'PT400';
    end if;
    if char_length(v_line1) < 5 then
      raise exception 'Enter house / street address.' using errcode = 'PT400';
    end if;
    if char_length(v_city) < 2 then
      raise exception 'Enter city.' using errcode = 'PT400';
    end if;
    if char_length(v_state) < 2 then
      raise exception 'Enter state.' using errcode = 'PT400';
    end if;
    if v_pincode !~ '^[0-9]{6}$' then
      raise exception 'Enter a 6-digit pincode.' using errcode = 'PT400';
    end if;
  end if;

  insert into public.orders (
    total_amount, payment_method, source,
    customer_name, customer_phone, address_line1, address_line2, city, state, pincode,
    sales_person_id, attended_by_name
  )
  values (
    0, p_payment_method, p_source,
    v_name, v_phone, v_line1, v_line2, v_city, v_state, v_pincode,
    v_sales_person_id, v_sales_name
  )
  returning id into v_order_id;

  v_total := public._apply_order_lines(v_order_id, p_items, p_source = 'POS');

  update public.orders set total_amount = v_total where id = v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'total_amount', v_total);
end;
$$;

-- p_sales_person_id null = leave the bill's salesperson as it is.
create or replace function public.update_pos_order(
  p_order_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_sales_person_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_current_sales_person uuid;
  v_new_sales_person uuid;
  v_new_sales_name text;
  v_ids uuid[];
  v_total numeric;
  v_old_prices jsonb;
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;

  if p_payment_method is null or p_payment_method not in ('CASH', 'UPI') then
    raise exception 'payment_method must be CASH or UPI' using errcode = 'PT400';
  end if;

  perform public._validate_order_lines(p_items);

  select source, sales_person_id
    into v_source, v_current_sales_person
  from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'PT404';
  end if;
  if v_source <> 'POS' then
    raise exception 'Only POS bills can be edited here.' using errcode = 'PT400';
  end if;

  if exists (
    select 1 from public.pos_delete_requests
    where order_id = p_order_id and status = 'pending'
  ) then
    raise exception 'This bill has a pending delete request. An admin must approve or reject it first.'
      using errcode = 'PT409';
  end if;

  -- Changing the salesperson: the new one must be active. Keeping the current
  -- one is always fine, even if they have been deactivated since.
  if p_sales_person_id is not null and p_sales_person_id is distinct from v_current_sales_person then
    select sp.id, sp.name
      into v_new_sales_person, v_new_sales_name
    from public.sales_people sp
    where sp.id = p_sales_person_id and sp.active;
    if not found then
      raise exception 'That salesperson is not available. Pick someone from the list.'
        using errcode = 'PT400';
    end if;
  end if;

  select coalesce(
           jsonb_agg(jsonb_build_object('variant_id', variant_id, 'price', price_at_purchase)),
           '[]'::jsonb
         )
    into v_old_prices
  from public.order_items
  where order_id = p_order_id;

  select array_agg(distinct vid)
    into v_ids
  from (
    select variant_id as vid from public.order_items where order_id = p_order_id
    union
    select (e->>'variant_id')::uuid from jsonb_array_elements(p_items) e
  ) s;

  perform 1 from public.product_variants where id = any (v_ids) order by id for update;

  update public.product_variants pv
     set stock_quantity = pv.stock_quantity + oi.qty,
         updated_at = now()
    from (
      select variant_id, sum(quantity)::int as qty
      from public.order_items
      where order_id = p_order_id
      group by variant_id
    ) oi
   where pv.id = oi.variant_id;

  delete from public.order_items where order_id = p_order_id;

  v_total := public._apply_order_lines(p_order_id, p_items, true, v_old_prices);

  update public.orders
     set payment_method = p_payment_method,
         total_amount = v_total,
         sales_person_id = coalesce(v_new_sales_person, sales_person_id),
         attended_by_name = case
           when v_new_sales_person is not null then v_new_sales_name
           else attended_by_name
         end
   where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'total_amount', v_total);
end;
$$;

revoke all on function public.place_order(text, text, jsonb, jsonb, uuid) from public, anon;
revoke all on function public.update_pos_order(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.place_order(text, text, jsonb, jsonb, uuid) to authenticated, service_role;
grant execute on function public.update_pos_order(uuid, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sales per person (admin only)
-- ---------------------------------------------------------------------------
-- POS bills only (online orders have no attendant). Deleted bills are gone from
-- the table, so they drop out of the totals automatically. A final
-- "Unassigned" row (sales_person_id null) covers bills without a salesperson.

create or replace function public.sales_by_person(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  sales_person_id uuid,
  name text,
  active boolean,
  bills bigint,
  pieces bigint,
  total_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view sales.' using errcode = 'PT403';
  end if;

  return query
  with scoped as (
    select o.id as order_id, o.sales_person_id as sp_id, o.total_amount as amount
    from public.orders o
    where o.source = 'POS'
      and (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
  ),
  piece_counts as (
    select s.order_id, coalesce(sum(oi.quantity), 0) as qty
    from scoped s
    left join public.order_items oi on oi.order_id = s.order_id
    group by s.order_id
  )
  select sp.id, sp.name, sp.active,
         count(s.order_id)::bigint,
         coalesce(sum(pc.qty), 0)::bigint,
         coalesce(sum(s.amount), 0)::numeric
  from public.sales_people sp
  left join scoped s on s.sp_id = sp.id
  left join piece_counts pc on pc.order_id = s.order_id
  group by sp.id, sp.name, sp.active

  union all

  select null::uuid, 'Unassigned'::text, true,
         count(s.order_id)::bigint,
         coalesce(sum(pc.qty), 0)::bigint,
         coalesce(sum(s.amount), 0)::numeric
  from scoped s
  join piece_counts pc on pc.order_id = s.order_id
  where s.sp_id is null
  having count(s.order_id) > 0;
end;
$$;

revoke all on function public.sales_by_person(timestamptz, timestamptz) from public, anon;
grant execute on function public.sales_by_person(timestamptz, timestamptz) to authenticated;
