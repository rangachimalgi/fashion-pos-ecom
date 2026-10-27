-- 015: POS price floor - a discounted line may never sell below cost + 5%.
-- Requires 013 + 014. Safe to re-run.
--
--   minimum unit price = products.cost_price * 1.05
--
-- * Applies to every role (admin included). To exempt admins, wrap the floor
--   check below in `v_role <> 'admin'`.
-- * Only checked on DISCOUNTED lines (price below MRP). A line sold at full MRP
--   is never blocked, even if MRP itself is under cost + 5%.
-- * Products with no cost_price have no floor (nothing to compare against).
-- * Re-saving an existing bill keeps prices it already had ("grandfathered"),
--   so an old bill is not rejected after a cost price is updated.

create or replace function public.min_margin_percent()
returns numeric
language sql
immutable
as $$
  select 5::numeric;
$$;

revoke all on function public.min_margin_percent() from public;
grant execute on function public.min_margin_percent() to authenticated, service_role;

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

      -- Only discounted lines are checked (1 paisa tolerance for rounding).
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

    insert into public.order_items (order_id, variant_id, quantity, price_at_purchase)
    values (p_order_id, v_variant_id, v_qty, v_price);

    v_total := v_total + v_price * v_qty;
  end loop;

  return round(v_total, 2);
end;
$$;

revoke all on function public._apply_order_lines(uuid, jsonb, boolean, jsonb) from public, anon, authenticated;
