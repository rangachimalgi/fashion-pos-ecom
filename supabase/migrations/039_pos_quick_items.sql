-- POS quick items: when a piece isn't in the catalog (or the system shows no
-- stock), staff type a name + price and sell it right away. It becomes a real
-- product + variant (so bills, edits, exchanges, reports and GST keep working),
-- marked pos_only so it never shows in the online shop until an admin
-- completes it in Admin → Products.
-- Run after 013. Safe to re-run.

alter table public.products
  add column if not exists pos_only boolean not null default false,
  add column if not exists quick_added_at timestamptz,
  add column if not exists quick_added_by uuid;

create index if not exists products_quick_added_idx on public.products (quick_added_at desc)
  where quick_added_at is not null;

create or replace function public.pos_quick_add_item(
  p_name text,
  p_price numeric,
  p_quantity integer default 1,
  p_size text default null,
  p_department text default null,
  p_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_price numeric := round(coalesce(p_price, 0), 2);
  v_qty integer := coalesce(p_quantity, 1);
  v_size text := coalesce(nullif(btrim(coalesce(p_size, '')), ''), 'Free');
  v_barcode text;
  v_product jsonb;
  v_variant jsonb;
  v_product_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Enter what the item is (e.g. T-shirt).' using errcode = 'PT400';
  end if;
  if v_price <= 0 or v_price > 1000000 then
    raise exception 'Enter the price.' using errcode = 'PT400';
  end if;
  if v_qty < 1 or v_qty > 999 then
    raise exception 'Quantity must be between 1 and 999.' using errcode = 'PT400';
  end if;

  loop
    v_barcode := 'QK' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD')
      || lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.product_variants where barcode = v_barcode);
  end loop;

  insert into public.products (
    name, brand, description, base_price, image_url, department, category,
    pos_only, quick_added_at, quick_added_by
  )
  values (
    v_name, 'Quick item', null, v_price, null,
    nullif(btrim(coalesce(p_department, '')), ''),
    nullif(btrim(coalesce(p_category, '')), ''),
    true, now(), auth.uid()
  )
  returning id, to_jsonb(products.*) into v_product_id, v_product;

  insert into public.product_variants (product_id, size, color, barcode, stock_quantity)
  values (v_product_id, v_size, '—', v_barcode, v_qty)
  returning to_jsonb(product_variants.*) into v_variant;

  return jsonb_build_object('product', v_product, 'variant', v_variant);
end;
$$;

revoke all on function public.pos_quick_add_item(text, numeric, integer, text, text, text) from public, anon;
grant execute on function public.pos_quick_add_item(text, numeric, integer, text, text, text) to authenticated;
