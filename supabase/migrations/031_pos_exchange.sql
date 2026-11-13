-- 031: POS exchange — return pieces from an old bill, take new ones, pay only the difference.
-- Requires 013 + 016 + 018. Safe to re-run.
--
-- Shop rule (same as the printed receipt): exchange within 2 shop days, no cash refund.
-- So the new items must be worth at least as much as the pieces coming back; the customer
-- pays only (new − credit). Stock for returned pieces goes back; new pieces come out.

-- ---------------------------------------------------------------------------
-- 1. Link a new bill to the one being exchanged, and log what came back
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists exchange_of uuid references public.orders (id) on delete set null;

create index if not exists orders_exchange_of_idx on public.orders (exchange_of)
  where exchange_of is not null;

create table if not exists public.pos_exchange_returns (
  id uuid primary key default gen_random_uuid(),
  original_order_id uuid not null references public.orders (id) on delete cascade,
  new_order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  quantity integer not null check (quantity > 0),
  credit_each numeric(12, 2) not null check (credit_each >= 0),
  created_at timestamptz not null default now()
);

create index if not exists pos_exchange_returns_original_idx
  on public.pos_exchange_returns (original_order_id, variant_id);

alter table public.pos_exchange_returns enable row level security;

drop policy if exists pos_exchange_returns_staff_read on public.pos_exchange_returns;
create policy pos_exchange_returns_staff_read on public.pos_exchange_returns
  for select to authenticated using (public.is_staff());

revoke all on public.pos_exchange_returns from anon;
grant select on public.pos_exchange_returns to authenticated;

-- ---------------------------------------------------------------------------
-- 2. How many of each size on a bill are still free to bring back
-- ---------------------------------------------------------------------------

create or replace function public.pos_exchange_availability(p_order_id uuid)
returns table (
  variant_id uuid,
  quantity integer,
  already_returned integer,
  available integer,
  price_at_purchase numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required.' using errcode = '42501';
  end if;

  return query
  with sold as (
    select oi.variant_id as vid,
           sum(oi.quantity)::integer as qty,
           (sum(oi.price_at_purchase * oi.quantity) / sum(oi.quantity))::numeric(12,2) as unit
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.variant_id
  ),
  returned as (
    select r.variant_id as vid, coalesce(sum(r.quantity), 0)::integer as qty
    from public.pos_exchange_returns r
    where r.original_order_id = p_order_id
    group by r.variant_id
  )
  select s.vid,
         s.qty,
         coalesce(r.qty, 0),
         greatest(s.qty - coalesce(r.qty, 0), 0),
         s.unit
  from sold s
  left join returned r on r.vid = s.vid
  order by s.vid;
end;
$$;

revoke all on function public.pos_exchange_availability(uuid) from public, anon;
grant execute on function public.pos_exchange_availability(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Do the exchange
-- ---------------------------------------------------------------------------
-- p_returns:  [{ "variant_id", "quantity" }, ...]  — pieces coming back
-- p_new_items: [{ "variant_id", "quantity", "unit_price"? }, ...] — pieces going out

create or replace function public.exchange_pos_order(
  p_original_order_id uuid,
  p_returns jsonb,
  p_new_items jsonb,
  p_payment_method text,
  p_sales_person_id uuid default null,
  p_cash_received jsonb default null,
  p_cash_change jsonb default null,
  p_window_days integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_created timestamptz;
  v_shop_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_bill_day date;
  v_window integer := coalesce(p_window_days, 2);
  v_ret jsonb;
  v_variant uuid;
  v_qty integer;
  v_avail integer;
  v_unit numeric;
  v_credit numeric := 0;
  v_debit numeric;
  v_due numeric;
  v_order_id uuid;
  v_sales_person_id uuid;
  v_sales_name text;
  v_ids uuid[];
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required to exchange a bill.' using errcode = '42501';
  end if;

  if p_payment_method is null or p_payment_method not in ('CASH', 'UPI') then
    raise exception 'payment_method must be CASH or UPI' using errcode = 'PT400';
  end if;

  if v_window < 0 or v_window > 30 then
    raise exception 'Exchange window must be between 0 and 30 days.' using errcode = 'PT400';
  end if;

  if p_returns is null or jsonb_typeof(p_returns) <> 'array' or jsonb_array_length(p_returns) = 0 then
    raise exception 'Pick at least one piece to bring back.' using errcode = 'PT400';
  end if;

  perform public._validate_order_lines(p_new_items);

  select source, created_at into v_source, v_created
  from public.orders
  where id = p_original_order_id
  for update;

  if not found then
    raise exception 'Original bill not found.' using errcode = 'PT404';
  end if;
  if v_source <> 'POS' then
    raise exception 'Only a POS bill can be exchanged here.' using errcode = 'PT400';
  end if;

  v_bill_day := (v_created at time zone 'Asia/Kolkata')::date;
  if v_shop_today > v_bill_day + v_window then
    raise exception 'Exchange period is % day(s). This bill is from % and can no longer be exchanged.',
      v_window, to_char(v_bill_day, 'DD Mon YYYY')
      using errcode = 'PT400';
  end if;

  -- Salesperson on the new bill (same rules as place_order).
  if p_sales_person_id is not null then
    select sp.id, sp.name into v_sales_person_id, v_sales_name
    from public.sales_people sp
    where sp.id = p_sales_person_id and sp.active;
    if not found then
      raise exception 'That salesperson is not available. Pick someone from the list.'
        using errcode = 'PT400';
    end if;
  elsif exists (select 1 from public.sales_people where active) then
    raise exception 'Choose who attended this customer.' using errcode = 'PT400';
  end if;

  -- Lock every variant that is coming back or going out.
  select array_agg(distinct id) into v_ids
  from (
    select (e->>'variant_id')::uuid as id from jsonb_array_elements(p_returns) e
    union
    select (e->>'variant_id')::uuid from jsonb_array_elements(p_new_items) e
  ) x;

  perform 1
  from public.product_variants
  where id = any (v_ids)
  order by id
  for update;

  -- Shape-check every return line, then collapse duplicates.
  for v_ret in select * from jsonb_array_elements(p_returns) loop
    if jsonb_typeof(v_ret) <> 'object'
       or coalesce(v_ret->>'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(jsonb_typeof(v_ret->'quantity'), '') <> 'number'
       or (v_ret->>'quantity') !~ '^[1-9][0-9]{0,5}$'
    then
      raise exception 'Each return needs a variant and a quantity of 1+.' using errcode = 'PT400';
    end if;
  end loop;

  for v_variant, v_qty in
    select (e->>'variant_id')::uuid, sum((e->>'quantity')::int)::integer
    from jsonb_array_elements(p_returns) e
    group by 1
  loop
    select a.available, a.price_at_purchase
      into v_avail, v_unit
    from public.pos_exchange_availability(p_original_order_id) a
    where a.variant_id = v_variant;

    if v_avail is null then
      raise exception 'That size is not on the original bill.' using errcode = 'PT400';
    end if;
    if v_qty > v_avail then
      raise exception 'Only % of that size can still be exchanged on this bill.', v_avail
        using errcode = 'PT409';
    end if;

    v_credit := v_credit + round(v_unit * v_qty, 2);
  end loop;

  insert into public.orders (
    total_amount, payment_method, source,
    sales_person_id, attended_by_name, exchange_of
  )
  values (
    0, p_payment_method, 'POS',
    v_sales_person_id, v_sales_name, p_original_order_id
  )
  returning id into v_order_id;

  v_debit := public._apply_order_lines(v_order_id, p_new_items, true);
  update public.orders set total_amount = v_debit where id = v_order_id;

  v_due := round(v_debit - v_credit, 2);
  if v_due < 0 then
    raise exception
      'No cash refund on exchange. New items are ₹%; credit is ₹%. Pick items worth at least the credit.'
      , to_char(v_debit, 'FM9999990.00'), to_char(v_credit, 'FM9999990.00')
      using errcode = 'PT400';
  end if;

  -- Restock returned pieces and log them against the new bill.
  for v_variant, v_qty in
    select (e->>'variant_id')::uuid, sum((e->>'quantity')::int)::integer
    from jsonb_array_elements(p_returns) e
    group by 1
  loop
    -- Price the customer originally paid (weighted if the bill had split lines).
    select (sum(oi.price_at_purchase * oi.quantity) / sum(oi.quantity))::numeric(12,2)
      into v_unit
    from public.order_items oi
    where oi.order_id = p_original_order_id and oi.variant_id = v_variant;

    update public.product_variants
       set stock_quantity = stock_quantity + v_qty,
           updated_at = now()
     where id = v_variant;

    insert into public.pos_exchange_returns (
      original_order_id, new_order_id, variant_id, quantity, credit_each
    ) values (
      p_original_order_id, v_order_id, v_variant, v_qty, v_unit
    );
  end loop;

  -- Customer pays only the difference; even swaps leave the drawer alone.
  if p_payment_method = 'CASH' and v_due > 0 then
    perform public._record_cash_sale(v_order_id, v_due, p_cash_received, p_cash_change);
  elsif p_payment_method = 'CASH' and v_due = 0 then
    -- Even exchange in cash: no drawer move. Ignore any counts that were sent.
    null;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'total_amount', v_debit,
    'credit', v_credit,
    'due', v_due
  );
end;
$$;

revoke all on function public.exchange_pos_order(uuid, jsonb, jsonb, text, uuid, jsonb, jsonb, integer)
  from public, anon;
grant execute on function public.exchange_pos_order(uuid, jsonb, jsonb, text, uuid, jsonb, jsonb, integer)
  to authenticated;

notify pgrst, 'reload schema';
