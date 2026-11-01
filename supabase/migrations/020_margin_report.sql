-- 020: Item-wise margin report (admin only).
-- Requires 013 - 017. Safe to re-run.
--
-- One row per bill line, like the client's old software: date, bill, item
-- code, item name, cost, MRP value, discount, net value and margin. The
-- database only hands over the raw figures; the page does the GST split and
-- the margin sums, so its totals match the Sales & profit report.
--
--   unit_price   what the customer paid per piece (GST included)
--   unit_cost    cost per piece when it was sold (null = no cost on record)
--   mrp          the product's CURRENT MRP, never below unit_price. It only
--                feeds the "Sale value" and "Item discount" columns; net sales
--                and margin come from unit_price and do not depend on it.
--   Items deleted from the catalogue after being sold still appear, with
--   "(deleted item)" as the name.

create or replace function public.margin_report_lines(
  p_from date default null,
  p_to date default null,
  p_source text default null,
  p_timezone text default 'Asia/Kolkata'
)
returns table (
  sold_at timestamptz,
  order_id uuid,
  source text,
  item_code text,
  style_code text,
  item_name text,
  size text,
  color text,
  qty integer,
  mrp numeric,
  unit_price numeric,
  unit_cost numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view reports.' using errcode = 'PT403';
  end if;
  if p_source is not null and p_source not in ('POS', 'ONLINE') then
    raise exception 'source must be POS or ONLINE' using errcode = 'PT400';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'The start date is after the end date.' using errcode = 'PT400';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown time zone' using errcode = 'PT400';
  end if;

  return query
  select
    o.created_at,
    o.id,
    o.source,
    pv.barcode,
    p.style_code,
    coalesce(p.name, '(deleted item)'),
    pv.size,
    pv.color,
    oi.quantity,
    greatest(coalesce(p.base_price, oi.price_at_purchase), oi.price_at_purchase),
    oi.price_at_purchase,
    oi.cost_at_purchase
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  left join public.product_variants pv on pv.id = oi.variant_id
  left join public.products p on p.id = pv.product_id
  where (p_source is null or o.source = p_source)
    and (p_from is null or o.created_at >= (p_from::timestamp at time zone p_timezone))
    and (p_to is null or o.created_at < ((p_to + 1)::timestamp at time zone p_timezone))
  order by o.created_at, o.id, oi.id;
end;
$$;

revoke all on function public.margin_report_lines(date, date, text, text) from public, anon;
grant execute on function public.margin_report_lines(date, date, text, text) to authenticated;

notify pgrst, 'reload schema';
