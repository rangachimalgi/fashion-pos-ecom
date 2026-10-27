-- 014: Three POS roles, per-role discount caps, and approval-based bill deletion.
-- Requires 013. Safe to re-run.
--
--   role      max line discount   delete a bill
--   admin     100% (<= MRP)       directly
--   manager   5%                  must send a request (reason) -> admin approves
--   staff     2%                  must send a request (reason) -> admin approves
--
-- Everything is enforced here in the database, so the UI cannot be bypassed.
--
-- Create the manager / staff logins in Supabase Auth, then:
--   insert into public.profiles (user_id, role)
--   select id, 'manager' from auth.users where email = 'manager@yourshop.com'
--   on conflict (user_id) do update set role = excluded.role;

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'manager', 'staff'));

create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.user_id = auth.uid()
    and p.role in ('admin', 'manager', 'staff');
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_role() is not null;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_role() = 'admin';
$$;

-- Max discount (percent of MRP) a role may give on a bill line.
create or replace function public.discount_cap_percent(p_role text)
returns numeric
language sql
immutable
as $$
  select case p_role
    when 'admin' then 100
    when 'manager' then 5
    when 'staff' then 2
    else 0
  end;
$$;

revoke all on function public.staff_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.discount_cap_percent(text) from public;
grant execute on function public.staff_role() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.discount_cap_percent(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Delete requests
-- ---------------------------------------------------------------------------

create table if not exists public.pos_delete_requests (
  id uuid primary key default gen_random_uuid(),
  -- set to null when the bill is actually deleted; the snapshot keeps the record
  order_id uuid references public.orders (id) on delete set null,
  order_snapshot jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references auth.users (id) on delete set null,
  requested_by_email text,
  requested_by_role text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_email text,
  reviewed_at timestamptz,
  review_note text
);

-- Only one open request per bill.
create unique index if not exists pos_delete_requests_one_pending
  on public.pos_delete_requests (order_id)
  where status = 'pending';

create index if not exists pos_delete_requests_status_idx
  on public.pos_delete_requests (status, requested_at desc);

alter table public.pos_delete_requests enable row level security;

drop policy if exists delete_requests_staff_read on public.pos_delete_requests;
create policy delete_requests_staff_read on public.pos_delete_requests
  for select to authenticated using (public.is_staff());

-- No insert/update/delete policies: changes only happen through the functions.
revoke all on public.pos_delete_requests from anon;
revoke insert, update, delete on public.pos_delete_requests from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Order line logic: now role-aware
-- ---------------------------------------------------------------------------
-- Replaces the 3-argument helper from 013 (a second overload would make the
-- call inside place_order ambiguous).

drop function if exists public._apply_order_lines(uuid, jsonb, boolean);

-- p_grandfathered: [{variant_id, price}] prices already on the bill being edited.
-- Re-saving a bill must not fail just because an admin gave a bigger discount
-- earlier; the cap applies to NEW or CHANGED prices.
create or replace function public._apply_order_lines(
  p_order_id uuid,
  p_items jsonb,
  p_custom_prices boolean,
  p_grandfathered jsonb default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_ids uuid[];
  v_locked int;
  v_variant_id uuid;
  v_qty int;
  v_price numeric;
  v_mrp numeric;
  v_name text;
  v_stock numeric;
  v_total numeric := 0;
  v_role text := public.staff_role();
  v_cap numeric := public.discount_cap_percent(public.staff_role());
begin
  perform public._validate_order_lines(p_items);

  select array_agg(distinct (e->>'variant_id')::uuid)
    into v_ids
  from jsonb_array_elements(p_items) e;

  perform 1
  from public.product_variants
  where id = any (v_ids)
  order by id
  for update;
  get diagnostics v_locked = row_count;

  if v_locked <> cardinality(v_ids) then
    raise exception 'One or more variants were not found' using errcode = 'PT404';
  end if;

  for v_line in select * from jsonb_array_elements(p_items) loop
    v_variant_id := (v_line->>'variant_id')::uuid;
    v_qty := (v_line->>'quantity')::int;

    select p.name, p.base_price
      into v_name, v_mrp
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_variant_id;

    if not found then
      raise exception 'Variant is missing its parent product' using errcode = 'PT404';
    end if;

    v_price := v_mrp;
    if p_custom_prices
       and v_line ? 'unit_price'
       and jsonb_typeof(v_line->'unit_price') <> 'null'
    then
      if jsonb_typeof(v_line->'unit_price') <> 'number' then
        raise exception 'Invalid price for %', v_name using errcode = 'PT400';
      end if;
      v_price := round((v_line->>'unit_price')::numeric, 2);
      if v_price < 0 or v_price > v_mrp + 0.01 then
        raise exception 'Invalid price for %', v_name using errcode = 'PT400';
      end if;

      -- Role discount cap (1 paisa of tolerance for client-side rounding).
      if v_price < round(v_mrp * (1 - v_cap / 100), 2) - 0.01 then
        if not exists (
          select 1
          from jsonb_array_elements(coalesce(p_grandfathered, '[]'::jsonb)) g
          where (g->>'variant_id')::uuid = v_variant_id
            and (g->>'price')::numeric = v_price
        ) then
          raise exception 'Discount on % is above the % percent limit for your role (%).',
            v_name, v_cap, coalesce(v_role, 'unknown')
            using errcode = 'PT403';
        end if;
      end if;
    end if;

    update public.product_variants
       set stock_quantity = stock_quantity - v_qty,
           updated_at = now()
     where id = v_variant_id
       and stock_quantity >= v_qty;

    if not found then
      select stock_quantity into v_stock from public.product_variants where id = v_variant_id;
      raise exception 'Not enough stock for %. Available: %', v_name, v_stock
        using errcode = 'PT409';
    end if;

    insert into public.order_items (order_id, variant_id, quantity, price_at_purchase)
    values (p_order_id, v_variant_id, v_qty, v_price);

    v_total := v_total + v_price * v_qty;
  end loop;

  return round(v_total, 2);
end;
$$;

revoke all on function public._apply_order_lines(uuid, jsonb, boolean, jsonb) from public, anon, authenticated;

-- Editing a bill: same discount caps, and locked while a delete is pending.
create or replace function public.update_pos_order(
  p_order_id uuid,
  p_payment_method text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
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

  select source into v_source from public.orders where id = p_order_id for update;
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
         total_amount = v_total
   where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'total_amount', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Deleting bills
-- ---------------------------------------------------------------------------

-- The actual delete (stock back into the catalog). No permission check here:
-- only called by delete_pos_order (admin) and review_pos_delete_request (admin).
create or replace function public._delete_pos_order_internal(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_ids uuid[];
begin
  select source into v_source from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'PT404';
  end if;
  if v_source <> 'POS' then
    raise exception 'Only POS bills can be deleted here.' using errcode = 'PT400';
  end if;

  select array_agg(distinct variant_id)
    into v_ids
  from public.order_items
  where order_id = p_order_id;

  if v_ids is not null then
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
  end if;

  -- An admin deleting directly also closes any open request for this bill.
  update public.pos_delete_requests
     set status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_by_email = (select u.email from auth.users u where u.id = auth.uid()),
         reviewed_at = now(),
         review_note = coalesce(review_note, 'Bill deleted directly by an admin')
   where order_id = p_order_id
     and status = 'pending';

  delete from public.orders where id = p_order_id; -- order_items cascade
end;
$$;

revoke all on function public._delete_pos_order_internal(uuid) from public, anon, authenticated;

-- Direct delete: admin only.
create or replace function public.delete_pos_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Only an admin can delete a bill directly. Send a delete request instead.'
      using errcode = 'PT403';
  end if;

  perform public._delete_pos_order_internal(p_order_id);
end;
$$;

-- Manager / staff: ask for a bill to be deleted.
create or replace function public.request_pos_order_delete(
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.staff_role();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_order public.orders%rowtype;
  v_snapshot jsonb;
  v_id uuid;
begin
  if v_role is null then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  if v_role = 'admin' then
    raise exception 'Admins can delete bills directly.' using errcode = 'PT400';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Tell us why this bill should be deleted (at least 5 characters).'
      using errcode = 'PT400';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Reason is too long (500 characters max).' using errcode = 'PT400';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'PT404';
  end if;
  if v_order.source <> 'POS' then
    raise exception 'Only POS bills can be deleted here.' using errcode = 'PT400';
  end if;

  if exists (
    select 1 from public.pos_delete_requests
    where order_id = p_order_id and status = 'pending'
  ) then
    raise exception 'A delete request for this bill is already pending.' using errcode = 'PT409';
  end if;

  -- Keep a copy of the bill: once approved, the bill itself is gone.
  select jsonb_build_object(
           'order_id', v_order.id,
           'created_at', v_order.created_at,
           'total_amount', v_order.total_amount,
           'payment_method', v_order.payment_method,
           'items', coalesce((
             select jsonb_agg(jsonb_build_object(
               'product_name', p.name,
               'size', pv.size,
               'color', pv.color,
               'quantity', oi.quantity,
               'price_at_purchase', oi.price_at_purchase
             ))
             from public.order_items oi
             left join public.product_variants pv on pv.id = oi.variant_id
             left join public.products p on p.id = pv.product_id
             where oi.order_id = v_order.id
           ), '[]'::jsonb)
         )
    into v_snapshot;

  insert into public.pos_delete_requests (
    order_id, order_snapshot, reason,
    requested_by, requested_by_email, requested_by_role
  )
  values (
    v_order.id, v_snapshot, v_reason,
    auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), v_role
  )
  returning id into v_id;

  return jsonb_build_object('request_id', v_id, 'status', 'pending');
end;
$$;

-- Admin: approve (deletes the bill and restores stock) or reject.
create or replace function public.review_pos_delete_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.pos_delete_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Only an admin can review delete requests.' using errcode = 'PT403';
  end if;
  if p_approve is null then
    raise exception 'Choose approve or reject.' using errcode = 'PT400';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Note is too long (500 characters max).' using errcode = 'PT400';
  end if;

  select * into v_req from public.pos_delete_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'PT404';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already reviewed.' using errcode = 'PT409';
  end if;

  if p_approve then
    if v_req.order_id is null or not exists (select 1 from public.orders where id = v_req.order_id) then
      raise exception 'This bill no longer exists. Reject the request to close it.'
        using errcode = 'PT404';
    end if;
    perform public._delete_pos_order_internal(v_req.order_id);
  end if;

  update public.pos_delete_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(),
         reviewed_by_email = (select u.email from auth.users u where u.id = auth.uid()),
         reviewed_at = now(),
         review_note = v_note
   where id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', case when p_approve then 'approved' else 'rejected' end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Who may call what (role checks happen inside the functions)
-- ---------------------------------------------------------------------------

revoke all on function public.update_pos_order(uuid, text, jsonb) from public, anon;
revoke all on function public.delete_pos_order(uuid) from public, anon;
revoke all on function public.request_pos_order_delete(uuid, text) from public, anon;
revoke all on function public.review_pos_delete_request(uuid, boolean, text) from public, anon;

grant execute on function public.update_pos_order(uuid, text, jsonb) to authenticated;
grant execute on function public.delete_pos_order(uuid) to authenticated;
grant execute on function public.request_pos_order_delete(uuid, text) to authenticated;
grant execute on function public.review_pos_delete_request(uuid, boolean, text) to authenticated;
