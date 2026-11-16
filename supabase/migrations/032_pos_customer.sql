-- POS bills: require customer name + phone (same columns as online shipping).
-- place_order already accepts p_shipping; for POS we only read name/phone.
-- update_pos_order / exchange_pos_order gain an optional p_shipping for the same.

create or replace function public._pos_customer_from_shipping(p_shipping jsonb)
returns table (customer_name text, customer_phone text)
language plpgsql
immutable
as $$
declare
  v_name text;
  v_phone text;
begin
  if p_shipping is null or jsonb_typeof(p_shipping) <> 'object' then
    raise exception 'Enter the customer name and phone.' using errcode = 'PT400';
  end if;

  v_name := btrim(coalesce(p_shipping->>'customer_name', ''));
  v_phone := right(regexp_replace(coalesce(p_shipping->>'customer_phone', ''), '\D', '', 'g'), 10);

  if char_length(v_name) < 2 then
    raise exception 'Enter the customer name.' using errcode = 'PT400';
  end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit Indian mobile number.' using errcode = 'PT400';
  end if;

  customer_name := v_name;
  customer_phone := v_phone;
  return next;
end;
$$;

revoke all on function public._pos_customer_from_shipping(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- place_order: POS also saves customer name + phone from p_shipping
-- ---------------------------------------------------------------------------
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

    select c.customer_name, c.customer_phone
      into v_name, v_phone
    from public._pos_customer_from_shipping(p_shipping) c;
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

  if p_source = 'POS' and p_payment_method = 'CASH' then
    perform public._record_cash_sale(v_order_id, v_total, p_cash_received, p_cash_change);
  end if;

  return jsonb_build_object('order_id', v_order_id, 'total_amount', v_total);
end;
$$;

revoke all on function public.place_order(text, text, jsonb, jsonb, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.place_order(text, text, jsonb, jsonb, uuid, jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- update_pos_order: optional p_shipping updates name + phone
-- ---------------------------------------------------------------------------
drop function if exists public.update_pos_order(uuid, text, jsonb, uuid, jsonb, jsonb);

create function public.update_pos_order(
  p_order_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_sales_person_id uuid default null,
  p_cash_received jsonb default null,
  p_cash_change jsonb default null,
  p_shipping jsonb default null
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
  v_name text;
  v_phone text;
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

  if p_shipping is not null then
    select c.customer_name, c.customer_phone
      into v_name, v_phone
    from public._pos_customer_from_shipping(p_shipping) c;
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
         end,
         customer_name = coalesce(v_name, customer_name),
         customer_phone = coalesce(v_phone, customer_phone)
   where id = p_order_id;

  select net_amount into v_old_cash_net from public.order_cash where order_id = p_order_id;

  if p_payment_method = 'UPI' then
    perform public._undo_cash_sale(p_order_id, 'Bill edited: no longer paid in cash');
  elsif v_old_cash_net is not null then
    if p_cash_received is null then
      if v_old_cash_net <> round(v_total) then
        raise exception 'The bill total changed. Enter the notes and coins received and the change given again.'
          using errcode = 'PT400';
      end if;
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

revoke all on function public.update_pos_order(uuid, text, jsonb, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.update_pos_order(uuid, text, jsonb, uuid, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- exchange_pos_order: new bill stores customer name + phone
-- ---------------------------------------------------------------------------
drop function if exists public.exchange_pos_order(uuid, jsonb, jsonb, text, uuid, jsonb, jsonb, integer);

create function public.exchange_pos_order(
  p_original_order_id uuid,
  p_returns jsonb,
  p_new_items jsonb,
  p_payment_method text,
  p_sales_person_id uuid default null,
  p_cash_received jsonb default null,
  p_cash_change jsonb default null,
  p_window_days integer default 2,
  p_shipping jsonb default null
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
  v_name text;
  v_phone text;
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

  select c.customer_name, c.customer_phone
    into v_name, v_phone
  from public._pos_customer_from_shipping(p_shipping) c;

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
    customer_name, customer_phone,
    sales_person_id, attended_by_name, exchange_of
  )
  values (
    0, p_payment_method, 'POS',
    v_name, v_phone,
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

  for v_variant, v_qty in
    select (e->>'variant_id')::uuid, sum((e->>'quantity')::int)::integer
    from jsonb_array_elements(p_returns) e
    group by 1
  loop
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

  if p_payment_method = 'CASH' and v_due > 0 then
    perform public._record_cash_sale(v_order_id, v_due, p_cash_received, p_cash_change);
  elsif p_payment_method = 'CASH' and v_due = 0 then
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

revoke all on function public.exchange_pos_order(uuid, jsonb, jsonb, text, uuid, jsonb, jsonb, integer, jsonb) from public, anon;
grant execute on function public.exchange_pos_order(uuid, jsonb, jsonb, text, uuid, jsonb, jsonb, integer, jsonb) to authenticated;
