-- Admin POS discounts: still capped at 100% of MRP, but the cost + 5% floor
-- does not apply. Managers/staff keep the floor. Same _apply_order_lines as 017,
-- with that one change.

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
  v_admin boolean := public.is_admin();
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

        -- Admins may discount to any price at or above ₹0 (role cap is 100%).
        -- Everyone else must stay at or above cost + min margin.
        v_floor := case
          when v_admin then null
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
