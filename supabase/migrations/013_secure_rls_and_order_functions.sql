-- 013: Lock down the database and make order/stock changes transactional.
--
-- BEFORE: every table had `using (true)` policies for the anon key, so anyone
-- with the public key (it ships to every browser) could read/modify/delete
-- orders, prices and stock. Checkout and POS edits were also multi-step
-- read-modify-write calls from the browser (race conditions, partial failures).
--
-- AFTER:
--   * Catalog (products, variants, categories): public READ, staff-only WRITE.
--   * Orders / order items: NO anonymous access. Staff can read. Nobody writes
--     directly - all writes go through the functions below (one transaction,
--     row locks, server-side prices).
--   * Online orders are placed by /api/checkout (service role -> place_order).
--     POS bills are placed by a signed-in staff user (place_order, source=POS).
--   * Staff = a row in public.profiles with role admin|staff. No profile row =
--     no access (the old auto-create trigger is removed).
--
-- Supersedes the anonymous policies from 001, 004, 005, 006, 009, 012.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Staff helper
-- ---------------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('admin', 'staff')
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Stop handing out staff access to every new sign-up
-- ---------------------------------------------------------------------------
-- The old trigger gave EVERY new auth user role 'staff'. If public sign-ups are
-- enabled, anyone could have become staff. Staff must now be added explicitly:
--   insert into public.profiles (user_id, role)
--   select id, 'staff' from auth.users where email = 'cashier@yourshop.com';

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;

-- AUDIT after running (remove anyone who should not have access):
--   select u.email, p.role from public.profiles p join auth.users u on u.id = p.user_id;

-- ---------------------------------------------------------------------------
-- 3. Reset policies on the tables we manage (drops the anonymous ones,
--    including any created by hand in the dashboard)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'products', 'product_variants', 'product_categories',
        'orders', 'order_items'
      )
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_categories enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Catalog: anyone can browse, only staff can change.
create policy products_public_read on public.products
  for select using (true);
create policy products_staff_insert on public.products
  for insert to authenticated with check (public.is_staff());
create policy products_staff_update on public.products
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy products_staff_delete on public.products
  for delete to authenticated using (public.is_staff());

create policy variants_public_read on public.product_variants
  for select using (true);
create policy variants_staff_insert on public.product_variants
  for insert to authenticated with check (public.is_staff());
create policy variants_staff_update on public.product_variants
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy variants_staff_delete on public.product_variants
  for delete to authenticated using (public.is_staff());

create policy categories_public_read on public.product_categories
  for select using (true);
create policy categories_staff_insert on public.product_categories
  for insert to authenticated with check (public.is_staff());
create policy categories_staff_update on public.product_categories
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy categories_staff_delete on public.product_categories
  for delete to authenticated using (public.is_staff());

-- Orders: staff can read. No insert/update/delete policies on purpose.
create policy orders_staff_read on public.orders
  for select to authenticated using (public.is_staff());
create policy order_items_staff_read on public.order_items
  for select to authenticated using (public.is_staff());

-- Defence in depth: even if someone adds a permissive policy later, the API
-- roles still cannot write orders directly.
revoke all on public.orders, public.order_items from anon;
revoke insert, update, delete on public.orders, public.order_items from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Order functions (all-or-nothing, row-locked, server-side prices)
-- ---------------------------------------------------------------------------
-- Error codes: PT400 validation, PT404 not found, PT409 stock conflict
-- (PostgREST turns PTxxx into that HTTP status), 42501 not allowed.

create or replace function public._validate_order_lines(p_items jsonb)
returns void
language plpgsql
immutable
as $$
declare
  v_line jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty' using errcode = 'PT400';
  end if;

  if jsonb_array_length(p_items) > 200 then
    raise exception 'Too many items in one order' using errcode = 'PT400';
  end if;

  for v_line in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_line) <> 'object'
       or coalesce(v_line->>'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(jsonb_typeof(v_line->'quantity'), '') <> 'number'
       or (v_line->>'quantity') !~ '^[1-9][0-9]{0,5}$'
    then
      raise exception 'Each item needs a variant_id and a quantity of 1+' using errcode = 'PT400';
    end if;
  end loop;
end;
$$;

-- Locks the variants, decrements stock, inserts the order lines and returns the
-- order total. Raises (and so rolls the whole transaction back) on any problem.
create or replace function public._apply_order_lines(
  p_order_id uuid,
  p_items jsonb,
  p_custom_prices boolean
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
begin
  perform public._validate_order_lines(p_items);

  select array_agg(distinct (e->>'variant_id')::uuid)
    into v_ids
  from jsonb_array_elements(p_items) e;

  -- Lock in a stable order so two concurrent orders cannot deadlock.
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

    -- Online orders always use the catalog price. Only staff-placed POS bills
    -- may carry a discounted price, and never above MRP.
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

create or replace function public.place_order(
  p_payment_method text,
  p_source text,
  p_items jsonb,
  p_shipping jsonb default null
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
    customer_name, customer_phone, address_line1, address_line2, city, state, pincode
  )
  values (
    0, p_payment_method, p_source,
    v_name, v_phone, v_line1, v_line2, v_city, v_state, v_pincode
  )
  returning id into v_order_id;

  v_total := public._apply_order_lines(v_order_id, p_items, p_source = 'POS');

  update public.orders set total_amount = v_total where id = v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'total_amount', v_total);
end;
$$;

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

  -- Lock every variant touched by the old and the new bill, in a stable order.
  select array_agg(distinct vid)
    into v_ids
  from (
    select variant_id as vid from public.order_items where order_id = p_order_id
    union
    select (e->>'variant_id')::uuid from jsonb_array_elements(p_items) e
  ) s;

  perform 1 from public.product_variants where id = any (v_ids) order by id for update;

  -- Put the old bill's stock back, then apply the new bill.
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

  v_total := public._apply_order_lines(p_order_id, p_items, true);

  update public.orders
     set payment_method = p_payment_method,
         total_amount = v_total
   where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'total_amount', v_total);
end;
$$;

create or replace function public.delete_pos_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_ids uuid[];
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;

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

  delete from public.orders where id = p_order_id; -- order_items cascade
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Who may call what
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default, and Supabase also grants it to
-- anon/authenticated, so revoke first and then grant explicitly.

revoke all on function public._validate_order_lines(jsonb) from public, anon, authenticated;
revoke all on function public._apply_order_lines(uuid, jsonb, boolean) from public, anon, authenticated;

revoke all on function public.place_order(text, text, jsonb, jsonb) from public, anon;
revoke all on function public.update_pos_order(uuid, text, jsonb) from public, anon;
revoke all on function public.delete_pos_order(uuid) from public, anon;

-- place_order: service_role (online checkout API) + signed-in staff (POS).
-- Inside, source = 'POS' additionally requires is_staff().
grant execute on function public.place_order(text, text, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.update_pos_order(uuid, text, jsonb) to authenticated;
grant execute on function public.delete_pos_order(uuid) to authenticated;
