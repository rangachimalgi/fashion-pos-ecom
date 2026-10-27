-- 017: Sales & profit reports (admin only).
-- Requires 013 - 016. Safe to re-run.
--
-- 1. order_items.cost_at_purchase: the cost price at the moment of sale, so a
--    later cost change does not rewrite old profit. Existing bills are filled
--    from the CURRENT cost price (best information available); lines whose
--    product has no cost stay null and are reported as "sales without cost".
-- 2. _apply_order_lines / update_pos_order keep that snapshot up to date.
-- 3. sales_report(): sales, GST, cost and profit per day or per month.

-- ---------------------------------------------------------------------------
-- 1. Cost snapshot
-- ---------------------------------------------------------------------------

alter table public.order_items
  add column if not exists cost_at_purchase numeric(12,2);

update public.order_items oi
   set cost_at_purchase = p.cost_price
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
 where pv.id = oi.variant_id
   and oi.cost_at_purchase is null
   and p.cost_price is not null;

-- ---------------------------------------------------------------------------
-- 2. Order lines now store the cost
-- ---------------------------------------------------------------------------
-- Same as 015 plus: cost_at_purchase on insert. When a bill is edited, a line
-- that already existed keeps the cost it was sold at (p_grandfathered carries
-- it); new lines take the current cost.

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
  v_cost numeric;
  v_cost_snapshot numeric;
  v_kept_cost numeric;
  v_floor numeric;
  v_below_cap boolean;
  v_below_floor boolean;
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

    select p.name, p.base_price, p.cost_price
      into v_name, v_mrp, v_cost
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

      if v_price < v_mrp then
        v_below_cap := v_price < round(v_mrp * (1 - v_cap / 100), 2) - 0.01;

        v_floor := case
          when v_cost is null then null
          else round(v_cost * (1 + public.min_margin_percent() / 100), 2)
        end;
        v_below_floor := v_floor is not null and v_price < v_floor - 0.01;

        if v_below_cap or v_below_floor then
          if not exists (
            select 1
            from jsonb_array_elements(coalesce(p_grandfathered, '[]'::jsonb)) g
            where (g->>'variant_id')::uuid = v_variant_id
              and (g->>'price')::numeric = v_price
          ) then
            if v_below_floor then
              raise exception 'Price for % is below the minimum allowed (cost plus % percent margin).',
                v_name, public.min_margin_percent()
                using errcode = 'PT403';
            end if;
            raise exception 'Discount on % is above the % percent limit for your role (%).',
              v_name, v_cap, coalesce(v_role, 'unknown')
              using errcode = 'PT403';
          end if;
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

    -- Cost this piece was sold at: the old bill's snapshot if this line already
    -- existed (edit), otherwise today's cost price.
    v_kept_cost := null;
    select (g->>'cost')::numeric
      into v_kept_cost
    from jsonb_array_elements(coalesce(p_grandfathered, '[]'::jsonb)) g
    where (g->>'variant_id')::uuid = v_variant_id
      and g->>'cost' is not null
    limit 1;
    v_cost_snapshot := coalesce(v_kept_cost, v_cost);

    insert into public.order_items (order_id, variant_id, quantity, price_at_purchase, cost_at_purchase)
    values (p_order_id, v_variant_id, v_qty, v_price, v_cost_snapshot);

    v_total := v_total + v_price * v_qty;
  end loop;

  return round(v_total, 2);
end;
$$;

revoke all on function public._apply_order_lines(uuid, jsonb, boolean, jsonb) from public, anon, authenticated;

-- Same as 016, except the remembered prices now carry the cost snapshot too.
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

  return jsonb_build_object('order_id', p_order_id, 'total_amount', v_total);
end;
$$;

revoke all on function public.update_pos_order(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.update_pos_order(uuid, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The report
-- ---------------------------------------------------------------------------
-- One row per day or month (in the shop's time zone) that has sales.
--   gross_sales        what customers paid (GST included)
--   gst_amount         GST inside gross_sales, at p_gst_percent (0 = ignore GST)
--   net_sales          gross_sales - gst_amount
--   cost               cost of the pieces sold (lines with a known cost)
--   profit             net_sales - cost, over lines with a known cost
--   sales_without_cost net sales of lines with no cost on record; these are NOT
--                      in profit, so the page can warn about them
-- p_from / p_to are inclusive dates in p_timezone; null = no limit.

create or replace function public.sales_report(
  p_from date default null,
  p_to date default null,
  p_bucket text default 'day',
  p_source text default null,
  p_gst_percent numeric default 0,
  p_timezone text default 'Asia/Kolkata'
)
returns table (
  period date,
  bills bigint,
  pieces bigint,
  gross_sales numeric,
  gst_amount numeric,
  net_sales numeric,
  cost numeric,
  profit numeric,
  sales_without_cost numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_gst numeric := coalesce(p_gst_percent, 0);
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view reports.' using errcode = 'PT403';
  end if;
  if p_bucket is null or p_bucket not in ('day', 'month') then
    raise exception 'bucket must be day or month' using errcode = 'PT400';
  end if;
  if p_source is not null and p_source not in ('POS', 'ONLINE') then
    raise exception 'source must be POS or ONLINE' using errcode = 'PT400';
  end if;
  if v_gst < 0 or v_gst > 50 then
    raise exception 'GST percent must be between 0 and 50' using errcode = 'PT400';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'The start date is after the end date.' using errcode = 'PT400';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown time zone' using errcode = 'PT400';
  end if;

  return query
  with lines as (
    select
      date_trunc(p_bucket, o.created_at at time zone p_timezone)::date as period,
      o.id as order_id,
      oi.quantity as qty,
      oi.price_at_purchase * oi.quantity as gross,
      oi.price_at_purchase * oi.quantity / (1 + v_gst / 100) as net,
      oi.cost_at_purchase * oi.quantity as line_cost
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where (p_source is null or o.source = p_source)
      and (p_from is null or o.created_at >= (p_from::timestamp at time zone p_timezone))
      and (p_to is null or o.created_at < ((p_to + 1)::timestamp at time zone p_timezone))
  )
  select
    l.period,
    count(distinct l.order_id)::bigint,
    coalesce(sum(l.qty), 0)::bigint,
    round(coalesce(sum(l.gross), 0), 2),
    round(coalesce(sum(l.gross - l.net), 0), 2),
    round(coalesce(sum(l.net), 0), 2),
    round(coalesce(sum(l.line_cost), 0), 2),
    round(coalesce(sum(l.net - l.line_cost) filter (where l.line_cost is not null), 0), 2),
    round(coalesce(sum(l.net) filter (where l.line_cost is null), 0), 2)
  from lines l
  group by l.period
  order by l.period;
end;
$$;

revoke all on function public.sales_report(date, date, text, text, numeric, text) from public, anon;
grant execute on function public.sales_report(date, date, text, text, numeric, text) to authenticated;
