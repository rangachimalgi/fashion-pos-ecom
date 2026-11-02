-- 021: GST report - sales summary by HSN code (admin only).
-- Requires 013 - 019. Safe to re-run.
--
-- Same layout as the client's old software's HSN summary: for each HSN code
-- the pieces sold, total (MRP) value, item discount, net value (what customers
-- paid) and taxable value (net value with the GST taken out).
--
--   total_value    MRP x qty (the product's current MRP, never below the price paid)
--   item_disc      total_value - net_value
--   net_value      what customers paid, GST included
--   taxable_value  net_value / (1 + gst%)
--   gst_amount     net_value - taxable_value
--
-- A product's HSN is the one typed on its latest purchase entry (019). Products
-- that never came through a purchase entry, or had no HSN typed, are grouped
-- under an empty hsn ('') so nothing disappears from the totals.

create or replace function public.gst_hsn_summary(
  p_from date default null,
  p_to date default null,
  p_source text default null,
  p_gst_percent numeric default 5,
  p_timezone text default 'Asia/Kolkata'
)
returns table (
  hsn text,
  pieces bigint,
  total_value numeric,
  item_disc numeric,
  net_value numeric,
  taxable_value numeric,
  gst_amount numeric
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
      coalesce(h.hsn, '') as hsn,
      oi.quantity as qty,
      greatest(coalesce(p.base_price, oi.price_at_purchase), oi.price_at_purchase) * oi.quantity as sale_value,
      oi.price_at_purchase * oi.quantity as paid
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    left join public.product_variants pv on pv.id = oi.variant_id
    left join public.products p on p.id = pv.product_id
    left join lateral (
      select btrim(pi.hsn) as hsn
      from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      where pi.product_id = p.id
        and nullif(btrim(pi.hsn), '') is not null
      order by pu.entry_no desc, pi.line_no desc
      limit 1
    ) h on true
    where (p_source is null or o.source = p_source)
      and (p_from is null or o.created_at >= (p_from::timestamp at time zone p_timezone))
      and (p_to is null or o.created_at < ((p_to + 1)::timestamp at time zone p_timezone))
  )
  select
    l.hsn,
    coalesce(sum(l.qty), 0)::bigint,
    round(coalesce(sum(l.sale_value), 0), 2),
    round(coalesce(sum(l.sale_value - l.paid), 0), 2),
    round(coalesce(sum(l.paid), 0), 2),
    round(coalesce(sum(l.paid / (1 + v_gst / 100)), 0), 2),
    round(coalesce(sum(l.paid - l.paid / (1 + v_gst / 100)), 0), 2)
  from lines l
  group by l.hsn
  order by (l.hsn = ''), l.hsn;
end;
$$;

revoke all on function public.gst_hsn_summary(date, date, text, numeric, text) from public, anon;
grant execute on function public.gst_hsn_summary(date, date, text, numeric, text) to authenticated;

notify pgrst, 'reload schema';
