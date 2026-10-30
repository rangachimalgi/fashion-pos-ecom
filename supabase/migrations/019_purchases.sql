-- 019: Supplier purchases (the "purchase entry" screen).
-- Requires 013 - 018. Safe to re-run.
--
-- One purchase = supplier + their invoice + a table of lines. Saving it, in a
-- single transaction:
--   * creates a product per (item name, design, rate, discount, GST, MRP,
--     category, brand), so the same name bought at two different costs becomes
--     two separate products with their own MRP and barcode;
--   * adds one size/colour row (variant) per line, with a store barcode, and
--     puts the purchased quantity into stock;
--   * records the supplier invoice totals (discount, CGST, SGST, net invoice).
--
-- Cost rules (the shop's own definition):
--   unit cost  = rate - supplier discount + supplier GST   ("landed cost")
--   MRP        = unit cost + profit %, rounded up (done in the app, editable)
-- products.cost_price is set to the unit cost, so the POS price floor and the
-- profit report (017) use it automatically.
--
-- Admin only: everything here is cost data.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  code text,
  address text,
  phone text,
  gstin text,
  created_at timestamptz not null default now()
);

create unique index if not exists suppliers_name_key
  on public.suppliers (lower(btrim(name)));

-- Gaps are fine; numbers are never reused. To continue the old software's
-- numbering, run:  select setval('public.purchase_entry_seq', 116);
create sequence if not exists public.purchase_entry_seq start 1;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  entry_no bigint not null unique default nextval('public.purchase_entry_seq'),
  entry_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  supplier_invoice_no text,
  supplier_invoice_date date,
  total_pieces integer not null,
  gross_value numeric(12,2) not null,      -- qty x rate, before discount
  discount_amount numeric(12,2) not null,
  net_items numeric(12,2) not null,        -- after discount, before GST
  cgst numeric(12,2) not null,
  sgst numeric(12,2) not null,
  gst_total numeric(12,2) not null,
  round_off numeric(12,2) not null default 0,
  net_invoice numeric(12,2) not null,
  declared_total numeric(12,2),            -- total printed on the supplier's bill, for checking
  notes text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now()
);

-- The same supplier invoice cannot be entered twice.
create unique index if not exists purchases_supplier_invoice_key
  on public.purchases (supplier_id, lower(btrim(supplier_invoice_no)))
  where supplier_invoice_no is not null and btrim(supplier_invoice_no) <> '';

create index if not exists purchases_entry_date_idx on public.purchases (entry_date desc);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  line_no integer not null,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  item_name text not null,
  brand text,
  design text,
  department text not null,
  category text not null,
  color text not null,
  size text not null,
  hsn text,
  qty integer not null check (qty > 0),
  rate numeric(12,2) not null,
  disc_percent numeric(5,2) not null default 0,
  gst_percent numeric(5,2) not null default 0,
  line_value numeric(12,2) not null,       -- qty x rate x (1 - disc), before GST
  unit_cost numeric(12,2) not null,        -- per piece: rate - discount + GST
  markup_percent numeric(6,2),
  mrp numeric(12,2) not null,
  barcode text not null
);

create index if not exists purchase_items_purchase_idx on public.purchase_items (purchase_id, line_no);

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists "Admins read suppliers" on public.suppliers;
create policy "Admins read suppliers"
  on public.suppliers for select to authenticated using (public.is_admin());

drop policy if exists "Admins read purchases" on public.purchases;
create policy "Admins read purchases"
  on public.purchases for select to authenticated using (public.is_admin());

drop policy if exists "Admins read purchase items" on public.purchase_items;
create policy "Admins read purchase items"
  on public.purchase_items for select to authenticated using (public.is_admin());

-- Writes only through the functions below.
revoke all on public.suppliers, public.purchases, public.purchase_items from anon, authenticated;
grant select on public.suppliers, public.purchases, public.purchase_items to authenticated;
revoke all on sequence public.purchase_entry_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Store barcode, same idea as the app's generateStoreBarcode(): EV + time + random.
create or replace function public._new_store_barcode()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := 'EV'
      || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint))
      || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    v_code := left(v_code, 18);
    exit when not exists (select 1 from public.product_variants where barcode = v_code);
  end loop;
  return v_code;
end;
$$;

revoke all on function public._new_store_barcode() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Functions the app calls (admin only)
-- ---------------------------------------------------------------------------

-- Creates the supplier, or returns the existing one with that name (and fills
-- in any details that were empty). Returns the supplier id.
create or replace function public.save_supplier(
  p_name text,
  p_address text default null,
  p_phone text default null,
  p_gstin text default null,
  p_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_admin() then
    raise exception 'Only an admin can manage suppliers.' using errcode = 'PT403';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Supplier name needs 2 to 120 characters.' using errcode = 'PT400';
  end if;

  select id into v_id from public.suppliers where lower(btrim(name)) = lower(v_name);

  if v_id is null then
    insert into public.suppliers (name, address, phone, gstin, code)
    values (
      v_name,
      nullif(btrim(coalesce(p_address, '')), ''),
      nullif(btrim(coalesce(p_phone, '')), ''),
      nullif(upper(btrim(coalesce(p_gstin, ''))), ''),
      nullif(btrim(coalesce(p_code, '')), '')
    )
    returning id into v_id;
  else
    update public.suppliers
       set address = coalesce(address, nullif(btrim(coalesce(p_address, '')), '')),
           phone = coalesce(phone, nullif(btrim(coalesce(p_phone, '')), '')),
           gstin = coalesce(gstin, nullif(upper(btrim(coalesce(p_gstin, ''))), '')),
           code = coalesce(code, nullif(btrim(coalesce(p_code, '')), ''))
     where id = v_id;
  end if;

  return v_id;
end;
$$;

-- Saves a whole purchase. p_header: supplier_id, supplier_invoice_no,
-- supplier_invoice_date, entry_date, round_off, declared_total, notes.
-- p_items: [{item_name, brand, design, department, category, color, size, hsn,
--            qty, rate, disc_percent, gst_percent, markup_percent, mrp}, ...]
create or replace function public.save_purchase(p_header jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
  v_inv text;
  v_inv_date date;
  v_entry_date date;
  v_round numeric;
  v_declared numeric;
  v_notes text;
  v_purchase_id uuid;
  v_entry_no bigint;
  v_item jsonb;
  v_line int := 0;

  v_name text;
  v_brand text;
  v_design text;
  v_dept text;
  v_cat text;
  v_color text;
  v_size text;
  v_hsn text;
  v_qty int;
  v_rate numeric;
  v_disc numeric;
  v_gst numeric;
  v_markup numeric;
  v_mrp numeric;

  v_line_value numeric;
  v_unit_cost numeric;
  v_product_key text;
  v_variant_key text;
  v_product_id uuid;
  v_variant_id uuid;
  v_barcode text;
  v_style text;
  v_new_products int := 0;

  v_products jsonb := '{}'::jsonb;   -- product key  -> product id
  v_variants jsonb := '{}'::jsonb;   -- variant key  -> {id, barcode}
  v_out jsonb := '[]'::jsonb;

  v_pieces int := 0;
  v_gross numeric := 0;
  v_net numeric := 0;
  v_gst_raw numeric := 0;
  v_gst_total numeric;
  v_cgst numeric;
  v_discount numeric;
  v_net_invoice numeric;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can enter purchases.' using errcode = 'PT403';
  end if;

  if p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception 'Purchase details are missing.' using errcode = 'PT400';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 400 then
    raise exception 'A purchase needs between 1 and 400 lines.' using errcode = 'PT400';
  end if;

  v_supplier := nullif(p_header->>'supplier_id', '')::uuid;
  if v_supplier is null or not exists (select 1 from public.suppliers where id = v_supplier) then
    raise exception 'Choose the supplier.' using errcode = 'PT400';
  end if;

  v_inv := nullif(btrim(coalesce(p_header->>'supplier_invoice_no', '')), '');
  v_inv_date := nullif(p_header->>'supplier_invoice_date', '')::date;
  v_entry_date := coalesce(nullif(p_header->>'entry_date', '')::date, (now() at time zone 'Asia/Kolkata')::date);
  v_round := coalesce(nullif(p_header->>'round_off', '')::numeric, 0);
  v_declared := nullif(p_header->>'declared_total', '')::numeric;
  v_notes := nullif(btrim(coalesce(p_header->>'notes', '')), '');

  if abs(v_round) > 100 then
    raise exception 'Round off looks wrong (more than 100 rupees).' using errcode = 'PT400';
  end if;

  if v_inv is not null and exists (
    select 1 from public.purchases
    where supplier_id = v_supplier and lower(btrim(supplier_invoice_no)) = lower(v_inv)
  ) then
    raise exception 'Invoice % from this supplier is already entered.', v_inv using errcode = 'PT409';
  end if;

  -- Header first (totals are filled in once the lines are known).
  insert into public.purchases (
    entry_date, supplier_id, supplier_invoice_no, supplier_invoice_date,
    total_pieces, gross_value, discount_amount, net_items, cgst, sgst, gst_total,
    round_off, net_invoice, declared_total, notes, created_by, created_by_email
  )
  values (
    v_entry_date, v_supplier, v_inv, v_inv_date,
    0, 0, 0, 0, 0, 0, 0,
    v_round, 0, v_declared, v_notes, auth.uid(),
    (select u.email from auth.users u where u.id = auth.uid())
  )
  returning id, entry_no into v_purchase_id, v_entry_no;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_line := v_line + 1;

    v_name := btrim(coalesce(v_item->>'item_name', ''));
    v_brand := btrim(coalesce(v_item->>'brand', ''));
    v_design := btrim(coalesce(v_item->>'design', ''));
    v_dept := btrim(coalesce(v_item->>'department', ''));
    v_cat := btrim(coalesce(v_item->>'category', ''));
    v_color := coalesce(nullif(btrim(coalesce(v_item->>'color', '')), ''), 'Default');
    v_size := coalesce(nullif(btrim(coalesce(v_item->>'size', '')), ''), 'OS');
    v_hsn := nullif(btrim(coalesce(v_item->>'hsn', '')), '');
    v_qty := (v_item->>'qty')::int;
    v_rate := (v_item->>'rate')::numeric;
    v_disc := coalesce(nullif(v_item->>'disc_percent', '')::numeric, 0);
    v_gst := coalesce(nullif(v_item->>'gst_percent', '')::numeric, 0);
    v_markup := nullif(v_item->>'markup_percent', '')::numeric;
    v_mrp := (v_item->>'mrp')::numeric;

    if char_length(v_name) < 1 or char_length(v_name) > 120 then
      raise exception 'Line %: enter the item name.', v_line using errcode = 'PT400';
    end if;
    if v_dept not in ('Men', 'Women', 'Kids') or v_cat = '' then
      raise exception 'Line %: choose a category.', v_line using errcode = 'PT400';
    end if;
    if v_qty is null or v_qty < 1 or v_qty > 100000 then
      raise exception 'Line %: quantity must be 1 or more.', v_line using errcode = 'PT400';
    end if;
    if v_rate is null or v_rate <= 0 or v_rate > 10000000 then
      raise exception 'Line %: enter the cost rate.', v_line using errcode = 'PT400';
    end if;
    if v_disc < 0 or v_disc > 100 then
      raise exception 'Line %: discount must be between 0 and 100.', v_line using errcode = 'PT400';
    end if;
    if v_gst < 0 or v_gst > 40 then
      raise exception 'Line %: GST must be between 0 and 40.', v_line using errcode = 'PT400';
    end if;
    if v_mrp is null or v_mrp <= 0 or v_mrp > 10000000 then
      raise exception 'Line %: enter the MRP.', v_line using errcode = 'PT400';
    end if;
    v_mrp := round(v_mrp, 2);

    v_line_value := round(v_qty * v_rate * (1 - v_disc / 100), 2);
    v_unit_cost := round(v_rate * (1 - v_disc / 100) * (1 + v_gst / 100), 2);

    -- Same name + design + cost terms + MRP + category = one product (its
    -- sizes become variants). Anything different = a separate product.
    v_product_key := concat_ws('|',
      lower(v_name), lower(v_design), round(v_rate, 2)::text, round(v_disc, 2)::text,
      round(v_gst, 2)::text, v_mrp::text, v_dept, lower(v_cat), lower(v_brand));

    if v_products ? v_product_key then
      v_product_id := (v_products ->> v_product_key)::uuid;
    else
      v_new_products := v_new_products + 1;
      v_style := coalesce(nullif(v_design, ''), 'P' || v_entry_no || '-' || lpad(v_new_products::text, 2, '0'));

      insert into public.products (name, brand, style_code, base_price, cost_price, department, category, image_url, description)
      values (v_name, v_brand, v_style, v_mrp, v_unit_cost, v_dept, v_cat, null, null)
      returning id into v_product_id;

      v_products := v_products || jsonb_build_object(v_product_key, v_product_id);
    end if;

    v_variant_key := v_product_id::text || '|' || lower(v_size) || '|' || lower(v_color);

    if v_variants ? v_variant_key then
      -- Same size and colour listed twice in one product: add to the same row.
      v_variant_id := (v_variants -> v_variant_key ->> 'id')::uuid;
      v_barcode := v_variants -> v_variant_key ->> 'barcode';
      update public.product_variants
         set stock_quantity = stock_quantity + v_qty,
             updated_at = now()
       where id = v_variant_id;
    else
      v_barcode := public._new_store_barcode();
      insert into public.product_variants (product_id, size, color, barcode, stock_quantity)
      values (v_product_id, v_size, v_color, v_barcode, v_qty)
      returning id into v_variant_id;
      v_variants := v_variants || jsonb_build_object(
        v_variant_key, jsonb_build_object('id', v_variant_id, 'barcode', v_barcode));
    end if;

    insert into public.purchase_items (
      purchase_id, line_no, product_id, variant_id, item_name, brand, design,
      department, category, color, size, hsn, qty, rate, disc_percent, gst_percent,
      line_value, unit_cost, markup_percent, mrp, barcode
    )
    values (
      v_purchase_id, v_line, v_product_id, v_variant_id, v_name, nullif(v_brand, ''), nullif(v_design, ''),
      v_dept, v_cat, v_color, v_size, v_hsn, v_qty, v_rate, v_disc, v_gst,
      v_line_value, v_unit_cost, v_markup, v_mrp, v_barcode
    );

    v_pieces := v_pieces + v_qty;
    v_gross := v_gross + v_qty * v_rate;
    v_net := v_net + v_line_value;
    v_gst_raw := v_gst_raw + v_line_value * v_gst / 100;

    v_out := v_out || jsonb_build_object(
      'line_no', v_line, 'variant_id', v_variant_id, 'barcode', v_barcode,
      'item_name', v_name, 'size', v_size, 'qty', v_qty, 'mrp', v_mrp);
  end loop;

  v_gst_total := round(v_gst_raw, 2);
  v_cgst := round(v_gst_total / 2, 2);
  v_discount := round(v_gross, 2) - round(v_net, 2);
  v_net_invoice := round(v_net, 2) + v_gst_total + v_round;

  update public.purchases
     set total_pieces = v_pieces,
         gross_value = round(v_gross, 2),
         discount_amount = v_discount,
         net_items = round(v_net, 2),
         cgst = v_cgst,
         sgst = v_gst_total - v_cgst,
         gst_total = v_gst_total,
         net_invoice = v_net_invoice
   where id = v_purchase_id;

  return jsonb_build_object(
    'purchase_id', v_purchase_id,
    'entry_no', v_entry_no,
    'total_pieces', v_pieces,
    'net_invoice', v_net_invoice,
    'items', v_out
  );
end;
$$;

-- Removes a purchase that was entered by mistake, taking its products and
-- stock back out. Only allowed while nothing from it has been sold or had its
-- stock changed.
create or replace function public.delete_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_products uuid[];
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete a purchase.' using errcode = 'PT403';
  end if;

  perform 1 from public.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Purchase not found' using errcode = 'PT404';
  end if;

  select array_agg(distinct variant_id), array_agg(distinct product_id)
    into v_ids, v_products
  from public.purchase_items
  where purchase_id = p_purchase_id;

  if v_ids is not null then
    perform 1 from public.product_variants where id = any (v_ids) order by id for update;

    if exists (
      select 1
      from (
        select variant_id, sum(qty)::int as bought
        from public.purchase_items
        where purchase_id = p_purchase_id and variant_id is not null
        group by variant_id
      ) bought_rows
      left join public.product_variants pv on pv.id = bought_rows.variant_id
      where pv.id is null or pv.stock_quantity <> bought_rows.bought
    ) or exists (
      select 1 from public.order_items oi where oi.variant_id = any (v_ids)
    ) then
      raise exception 'Some pieces from this purchase were already sold or their stock was changed, so it cannot be deleted.'
        using errcode = 'PT409';
    end if;

    delete from public.product_variants where id = any (v_ids);
  end if;

  delete from public.purchases where id = p_purchase_id;  -- items cascade

  -- Products this purchase created that have no sizes left.
  if v_products is not null then
    delete from public.products p
     where p.id = any (v_products)
       and not exists (select 1 from public.product_variants v where v.product_id = p.id);
  end if;
end;
$$;

revoke all on function public.save_supplier(text, text, text, text, text) from public, anon;
revoke all on function public.save_purchase(jsonb, jsonb) from public, anon;
revoke all on function public.delete_purchase(uuid) from public, anon;
grant execute on function public.save_supplier(text, text, text, text, text) to authenticated;
grant execute on function public.save_purchase(jsonb, jsonb) to authenticated;
grant execute on function public.delete_purchase(uuid) to authenticated;
