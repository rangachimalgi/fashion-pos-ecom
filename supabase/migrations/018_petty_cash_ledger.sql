-- 018: Petty cash ledger (cash drawer by denomination).
-- Requires 013 - 017. Safe to re-run.
--
--   cash_drawer          one row per note/coin: how many are in the counter now
--   cash_ledger_entries  every movement (cash bill, undo of a bill, admin edit)
--   order_cash           what was received / given back for each cash POS bill
--
-- Rules
--   * Only an admin can read the drawer or its history, and only an admin can
--     edit it (set_cash_drawer). Nobody can write the tables directly.
--   * A CASH POS bill must say which notes/coins were received and which were
--     given back as change. received - change must equal the bill rounded to
--     the nearest rupee. The drawer moves in the same transaction as the bill.
--   * Editing a bill undoes its cash and records the new cash; deleting a bill
--     (directly, or by approving a delete request) undoes its cash.
--   * The drawer may go negative (e.g. the opening count was wrong). That never
--     blocks a sale; the admin sees it in red and recounts.
--   * Bills made before this migration have no cash record. They are left
--     alone, so editing or deleting them does not touch the drawer.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.cash_drawer (
  denomination integer primary key check (denomination > 0),
  quantity integer not null default 0,
  updated_at timestamptz not null default now()
);

-- To start accepting another note (e.g. 200), insert a row here.
insert into public.cash_drawer (denomination)
values (1), (2), (5), (10), (20), (50), (100), (500)
on conflict (denomination) do nothing;

create table if not exists public.cash_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('bill', 'bill_undo', 'adjustment')),
  order_id uuid references public.orders (id) on delete set null,
  -- Short bill number, kept after the bill itself is deleted.
  order_ref text,
  -- Net change per denomination, e.g. {"500": 1, "100": -3}.
  delta jsonb not null,
  -- Net money change (positive = cash in).
  amount numeric(12,2) not null,
  note text,
  actor_id uuid,
  actor_email text
);

create index if not exists cash_ledger_entries_created_idx
  on public.cash_ledger_entries (created_at desc);

create table if not exists public.order_cash (
  order_id uuid primary key references public.orders (id) on delete cascade,
  received jsonb not null,
  change jsonb not null default '{}'::jsonb,
  net_amount numeric(12,2) not null
);

alter table public.cash_drawer enable row level security;
alter table public.cash_ledger_entries enable row level security;
alter table public.order_cash enable row level security;

drop policy if exists "Admins read the drawer" on public.cash_drawer;
create policy "Admins read the drawer"
  on public.cash_drawer for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins read the cash history" on public.cash_ledger_entries;
create policy "Admins read the cash history"
  on public.cash_ledger_entries for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins read bill cash" on public.order_cash;
create policy "Admins read bill cash"
  on public.order_cash for select to authenticated
  using (public.is_admin());

-- No write policies exist, and direct writes are revoked as well.
revoke all on public.cash_drawer, public.cash_ledger_entries, public.order_cash from anon, authenticated;
grant select on public.cash_drawer, public.cash_ledger_entries, public.order_cash to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers (internal: not callable from the browser)
-- ---------------------------------------------------------------------------

-- Validates {"500": 2, "20": 1} and returns it without zero entries.
create or replace function public._cash_counts(p_counts jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_key text;
  v_val jsonb;
  v_n numeric;
  v_out jsonb := '{}'::jsonb;
begin
  if p_counts is null or jsonb_typeof(p_counts) <> 'object' then
    raise exception 'Cash must be a list of notes/coins and how many of each'
      using errcode = 'PT400';
  end if;

  for v_key, v_val in select * from jsonb_each(p_counts) loop
    if not exists (select 1 from public.cash_drawer where denomination::text = v_key) then
      raise exception 'Unknown note or coin: %', v_key using errcode = 'PT400';
    end if;
    if jsonb_typeof(v_val) <> 'number' then
      raise exception 'Invalid count for %', v_key using errcode = 'PT400';
    end if;
    v_n := (v_val #>> '{}')::numeric;
    if v_n <> trunc(v_n) or v_n < 0 or v_n > 100000 then
      raise exception 'Invalid count for %', v_key using errcode = 'PT400';
    end if;
    if v_n > 0 then
      v_out := v_out || jsonb_build_object(v_key, v_n::int);
    end if;
  end loop;

  return v_out;
end;
$$;

-- Rupee value of a counts object.
create or replace function public._cash_value(p_counts jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select coalesce(sum(key::numeric * value::numeric), 0)
  from jsonb_each_text(coalesce(p_counts, '{}'::jsonb));
$$;

-- a - b per denomination, non-zero entries only.
create or replace function public._cash_diff(p_a jsonb, p_b jsonb)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  from (
    select d.denomination::text as k,
           coalesce((p_a ->> d.denomination::text)::int, 0)
             - coalesce((p_b ->> d.denomination::text)::int, 0) as v
    from public.cash_drawer d
  ) s
  where v <> 0;
$$;

-- Applies a signed change to the drawer and logs it. Locks every drawer row
-- (always last, after bill/stock locks, so lock order is consistent).
create or replace function public._cash_move(
  p_delta jsonb,
  p_kind text,
  p_order_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_val jsonb;
begin
  if p_delta is null or p_delta = '{}'::jsonb then
    return;
  end if;

  perform 1 from public.cash_drawer order by denomination for update;

  for v_key, v_val in select * from jsonb_each(p_delta) loop
    update public.cash_drawer
       set quantity = quantity + (v_val #>> '{}')::int,
           updated_at = now()
     where denomination = v_key::int;
  end loop;

  insert into public.cash_ledger_entries (kind, order_id, order_ref, delta, amount, note, actor_id, actor_email)
  values (
    p_kind,
    p_order_id,
    case when p_order_id is null then null else upper(left(replace(p_order_id::text, '-', ''), 8)) end,
    p_delta,
    public._cash_value(p_delta),
    p_note,
    auth.uid(),
    (select u.email from auth.users u where u.id = auth.uid())
  );
end;
$$;

-- Records the cash side of a POS bill paid in CASH.
create or replace function public._record_cash_sale(
  p_order_id uuid,
  p_total numeric,
  p_received jsonb,
  p_change jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received jsonb;
  v_change jsonb;
  v_due numeric := round(p_total);
  v_net numeric;
begin
  if p_received is null then
    raise exception 'Enter the notes and coins received from the customer.'
      using errcode = 'PT400';
  end if;

  v_received := public._cash_counts(p_received);
  v_change := public._cash_counts(coalesce(p_change, '{}'::jsonb));

  if public._cash_value(v_received) <= 0 and v_due > 0 then
    raise exception 'Enter the notes and coins received from the customer.'
      using errcode = 'PT400';
  end if;

  v_net := public._cash_value(v_received) - public._cash_value(v_change);
  if v_net <> v_due then
    raise exception 'Cash received (%) minus change (%) is %, but this bill is % (rounded to the rupee).',
      public._cash_value(v_received), public._cash_value(v_change), v_net, v_due
      using errcode = 'PT400';
  end if;

  insert into public.order_cash (order_id, received, change, net_amount)
  values (p_order_id, v_received, v_change, v_due);

  perform public._cash_move(public._cash_diff(v_received, v_change), 'bill', p_order_id, null);
end;
$$;

-- Takes a bill's cash back out of the drawer (exactly the notes that came in,
-- and the change that went out, are reversed). Returns false for bills that
-- never had a cash record.
create or replace function public._undo_cash_sale(p_order_id uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received jsonb;
  v_change jsonb;
begin
  select received, change
    into v_received, v_change
  from public.order_cash
  where order_id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  perform public._cash_move(public._cash_diff(v_change, v_received), 'bill_undo', p_order_id, p_note);
  delete from public.order_cash where order_id = p_order_id;
  return true;
end;
$$;

revoke all on function public._cash_counts(jsonb) from public, anon, authenticated;
revoke all on function public._cash_value(jsonb) from public, anon, authenticated;
revoke all on function public._cash_diff(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._cash_move(jsonb, text, uuid, text) from public, anon, authenticated;
revoke all on function public._record_cash_sale(uuid, numeric, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._undo_cash_sale(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Functions the app calls
-- ---------------------------------------------------------------------------

-- Which notes/coins exist. Any staff member (needed to fill in a cash bill);
-- this reveals no amounts.
create or replace function public.cash_denominations()
returns table (denomination integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  return query select d.denomination from public.cash_drawer d order by d.denomination desc;
end;
$$;

-- Admin: set the counter to the counts you physically counted.
-- p_counts only needs the denominations that changed.
create or replace function public.set_cash_drawer(p_counts jsonb, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_val jsonb;
  v_new int;
  v_old int;
  v_delta jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the cash counter.' using errcode = 'PT403';
  end if;
  if p_note is null or char_length(btrim(p_note)) < 3 then
    raise exception 'Add a short note saying why (at least 3 characters).' using errcode = 'PT400';
  end if;
  if p_counts is null or jsonb_typeof(p_counts) <> 'object' then
    raise exception 'Counts must be a list of notes/coins and how many of each' using errcode = 'PT400';
  end if;

  perform 1 from public.cash_drawer order by denomination for update;

  for v_key, v_val in select * from jsonb_each(p_counts) loop
    if not exists (select 1 from public.cash_drawer where denomination::text = v_key) then
      raise exception 'Unknown note or coin: %', v_key using errcode = 'PT400';
    end if;
    if jsonb_typeof(v_val) <> 'number' then
      raise exception 'Invalid count for %', v_key using errcode = 'PT400';
    end if;
    if (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric)
       or (v_val #>> '{}')::numeric < 0
       or (v_val #>> '{}')::numeric > 1000000 then
      raise exception 'Invalid count for %', v_key using errcode = 'PT400';
    end if;

    v_new := (v_val #>> '{}')::int;
    select quantity into v_old from public.cash_drawer where denomination = v_key::int;
    if v_new <> v_old then
      v_delta := v_delta || jsonb_build_object(v_key, v_new - v_old);
    end if;
  end loop;

  if v_delta = '{}'::jsonb then
    raise exception 'Nothing changed.' using errcode = 'PT400';
  end if;

  perform public._cash_move(v_delta, 'adjustment', null, btrim(p_note));

  return jsonb_build_object('delta', v_delta, 'amount', public._cash_value(v_delta));
end;
$$;

revoke all on function public.cash_denominations() from public, anon;
revoke all on function public.set_cash_drawer(jsonb, text) from public, anon;
grant execute on function public.cash_denominations() to authenticated;
grant execute on function public.set_cash_drawer(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. place_order: cash bills move the drawer
-- ---------------------------------------------------------------------------
-- Two new parameters => new signature. Drop the old one so calls cannot be
-- ambiguous.

drop function if exists public.place_order(text, text, jsonb, jsonb, uuid);

create or replace function public.place_order(
  p_payment_method text,
  p_source text,
  p_items jsonb,
  p_shipping jsonb default null,
  p_sales_person_id uuid default null,
  p_cash_received jsonb default null,
  p_cash_change jsonb default null
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

  -- Only POS bills paid in cash touch the counter.
  if p_source = 'POS' and p_payment_method = 'CASH' then
    perform public._record_cash_sale(v_order_id, v_total, p_cash_received, p_cash_change);
  end if;

  return jsonb_build_object('order_id', v_order_id, 'total_amount', v_total);
end;
$$;

revoke all on function public.place_order(text, text, jsonb, jsonb, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.place_order(text, text, jsonb, jsonb, uuid, jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. update_pos_order: editing a bill keeps the drawer right
-- ---------------------------------------------------------------------------
-- Same as 017, plus the cash handling:
--   old cash record + now UPI                     -> undo it
--   old cash record + still CASH, same amount     -> keep it (send no counts)
--   old cash record + still CASH, counts sent     -> undo it, record the new counts
--   old cash record + still CASH, amount changed  -> counts are required
--   no cash record, was UPI, now CASH             -> counts required, recorded
--   no cash record, was CASH (made before 018)    -> drawer is left alone

drop function if exists public.update_pos_order(uuid, text, jsonb, uuid);

create or replace function public.update_pos_order(
  p_order_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_sales_person_id uuid default null,
  p_cash_received jsonb default null,
  p_cash_change jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_old_method text;
  v_current_sales_person uuid;
  v_new_sales_person uuid;
  v_new_sales_name text;
  v_ids uuid[];
  v_total numeric;
  v_old_prices jsonb;
  v_old_cash_net numeric;
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;

  if p_payment_method is null or p_payment_method not in ('CASH', 'UPI') then
    raise exception 'payment_method must be CASH or UPI' using errcode = 'PT400';
  end if;

  perform public._validate_order_lines(p_items);

  select source, payment_method, sales_person_id
    into v_source, v_old_method, v_current_sales_person
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
           jsonb_agg(jsonb_build_object(
             'variant_id', variant_id,
             'price', price_at_purchase,
             'cost', cost_at_purchase
           )),
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

  -- Cash drawer
  select net_amount into v_old_cash_net from public.order_cash where order_id = p_order_id;

  if p_payment_method = 'UPI' then
    perform public._undo_cash_sale(p_order_id, 'Bill edited: no longer paid in cash');
  elsif v_old_cash_net is not null then
    if p_cash_received is null then
      if v_old_cash_net <> round(v_total) then
        raise exception 'The bill total changed. Enter the notes and coins received and the change given again.'
          using errcode = 'PT400';
      end if;
      -- same amount, same cash: nothing to do
    else
      perform public._undo_cash_sale(p_order_id, 'Bill edited: cash re-entered');
      perform public._record_cash_sale(p_order_id, v_total, p_cash_received, p_cash_change);
    end if;
  elsif v_old_method = 'UPI' then
    perform public._record_cash_sale(p_order_id, v_total, p_cash_received, p_cash_change);
  end if;

  return jsonb_build_object('order_id', p_order_id, 'total_amount', v_total);
end;
$$;

revoke all on function public.update_pos_order(uuid, text, jsonb, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_pos_order(uuid, text, jsonb, uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Deleting a bill puts its cash back
-- ---------------------------------------------------------------------------
-- Same as 014, plus the cash undo. Used by the admin's direct delete and by
-- approving a delete request.

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

  perform public._undo_cash_sale(p_order_id, 'Bill deleted');

  -- An admin deleting directly also closes any open request for this bill.
  update public.pos_delete_requests
     set status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_by_email = (select u.email from auth.users u where u.id = auth.uid()),
         reviewed_at = now(),
         review_note = coalesce(review_note, 'Bill deleted directly by an admin')
   where order_id = p_order_id
     and status = 'pending';

  delete from public.orders where id = p_order_id; -- order_items and order_cash cascade
end;
$$;

revoke all on function public._delete_pos_order_internal(uuid) from public, anon, authenticated;
