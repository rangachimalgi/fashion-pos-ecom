-- Coupons: admin creates codes (percent or flat ₹ off) with optional minimum
-- bill, dates, total-use and per-customer limits, and channel (online / POS / both).
--
-- place_order gains p_coupon_code. The coupon is checked and applied inside the
-- same transaction: line prices are reduced proportionally so order_items stay
-- the real selling prices (reports, GST and margin keep working), and the order
-- stores coupon_code + coupon_discount. At the POS a coupon bill is priced from
-- MRP — manual line discounts are ignored (no stacking).
--
-- Safe to re-run.

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text not null default '',
  kind text not null check (kind in ('PERCENT', 'FLAT')),
  value numeric(12,2) not null check (value > 0),
  max_discount numeric(12,2) check (max_discount is null or max_discount > 0),
  min_order numeric(12,2) not null default 0 check (min_order >= 0),
  starts_on date,
  ends_on date,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  channel text not null default 'ALL' check (channel in ('ALL', 'ONLINE', 'POS')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_code_format check (code ~ '^[A-Z0-9_-]{3,20}$'),
  constraint coupons_percent_max check (kind <> 'PERCENT' or value <= 100),
  constraint coupons_date_order check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create unique index if not exists coupons_code_key on public.coupons (code);

alter table public.orders
  add column if not exists coupon_id uuid references public.coupons (id) on delete set null,
  add column if not exists coupon_code text,
  add column if not exists coupon_discount numeric(12,2) not null default 0;

create index if not exists orders_coupon_id_idx on public.orders (coupon_id) where coupon_id is not null;

-- Admin manages coupons directly; everyone else only goes through the functions below.
alter table public.coupons enable row level security;
revoke all on public.coupons from anon, authenticated;
grant select, insert, update, delete on public.coupons to authenticated;

drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all on public.coupons
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Quote: is this code usable for this bill, and how much off?
-- ---------------------------------------------------------------------------
create or replace function public._coupon_quote(
  p_code text,
  p_source text,
  p_subtotal numeric,
  p_phone text,
  p_lock boolean
)
returns table (coupon_id uuid, code text, discount numeric, coupon jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_sub numeric := round(coalesce(p_subtotal, 0), 2);
  v_used integer;
  v_discount numeric;
  c public.coupons%rowtype;
begin
  if v_code = '' then
    raise exception 'Enter a coupon code.' using errcode = 'PT400';
  end if;

  if p_lock then
    select * into c from public.coupons where coupons.code = v_code for update;
  else
    select * into c from public.coupons where coupons.code = v_code;
  end if;

  if not found or not c.active then
    raise exception 'Coupon % is not valid.', v_code using errcode = 'PT400';
  end if;
  if c.starts_on is not null and v_today < c.starts_on then
    raise exception 'Coupon % starts on %.', v_code, to_char(c.starts_on, 'DD Mon YYYY')
      using errcode = 'PT400';
  end if;
  if c.ends_on is not null and v_today > c.ends_on then
    raise exception 'Coupon % has expired.', v_code using errcode = 'PT400';
  end if;
  if c.channel = 'ONLINE' and p_source <> 'ONLINE' then
    raise exception 'Coupon % is for online orders only.', v_code using errcode = 'PT400';
  end if;
  if c.channel = 'POS' and p_source <> 'POS' then
    raise exception 'Coupon % can only be used in the store.', v_code using errcode = 'PT400';
  end if;
  if v_sub < c.min_order then
    raise exception 'Coupon % needs a bill of at least ₹%.', v_code, to_char(c.min_order, 'FM9999990')
      using errcode = 'PT400';
  end if;

  if c.usage_limit is not null then
    select count(*) into v_used from public.orders o where o.coupon_id = c.id;
    if v_used >= c.usage_limit then
      raise exception 'Coupon % has been fully used.', v_code using errcode = 'PT400';
    end if;
  end if;

  if c.per_customer_limit is not null then
    if v_phone !~ '^[6-9][0-9]{9}$' then
      raise exception 'Enter the mobile number to use coupon %.', v_code using errcode = 'PT400';
    end if;
    select count(*) into v_used
    from public.orders o
    where o.coupon_id = c.id and o.customer_phone = v_phone;
    if v_used >= c.per_customer_limit then
      raise exception 'This mobile number has already used coupon %.', v_code using errcode = 'PT400';
    end if;
  end if;

  if c.kind = 'PERCENT' then
    v_discount := round(v_sub * c.value / 100);
    if c.max_discount is not null then
      v_discount := least(v_discount, c.max_discount);
    end if;
  else
    v_discount := c.value;
  end if;
  v_discount := greatest(0, least(v_discount, v_sub));

  coupon_id := c.id;
  code := c.code;
  discount := v_discount;
  coupon := jsonb_build_object(
    'code', c.code,
    'description', c.description,
    'kind', c.kind,
    'value', c.value,
    'max_discount', c.max_discount,
    'min_order', c.min_order
  );
  return next;
end;
$$;

revoke all on function public._coupon_quote(text, text, numeric, text, boolean) from public, anon, authenticated;

-- Preview for the bag and the POS (nothing is reserved until the order is placed).
create or replace function public.check_coupon(
  p_code text,
  p_source text,
  p_subtotal numeric,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
begin
  if p_source is null or p_source not in ('ONLINE', 'POS') then
    raise exception 'source must be ONLINE or POS' using errcode = 'PT400';
  end if;
  if p_source = 'POS' and not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;

  select * into q from public._coupon_quote(p_code, p_source, p_subtotal, p_phone, false);
  return q.coupon || jsonb_build_object('discount', q.discount);
end;
$$;

revoke all on function public.check_coupon(text, text, numeric, text) from public;
grant execute on function public.check_coupon(text, text, numeric, text) to anon, authenticated, service_role;

-- Applies a coupon to an order whose lines are already inserted.
create or replace function public._apply_coupon(
  p_order_id uuid,
  p_code text,
  p_source text,
  p_phone text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub numeric;
  v_total numeric;
  q record;
begin
  select coalesce(sum(price_at_purchase * quantity), 0) into v_sub
  from public.order_items where order_id = p_order_id;

  select * into q from public._coupon_quote(p_code, p_source, v_sub, p_phone, true);

  if q.discount > 0 and v_sub > 0 then
    update public.order_items
       set price_at_purchase = round(price_at_purchase * (v_sub - q.discount) / v_sub, 2)
     where order_id = p_order_id;
  end if;

  select round(coalesce(sum(price_at_purchase * quantity), 0), 2) into v_total
  from public.order_items where order_id = p_order_id;

  update public.orders
     set coupon_id = q.coupon_id,
         coupon_code = q.code,
         coupon_discount = round(v_sub - v_total, 2)
   where id = p_order_id;

  return v_total;
end;
$$;

revoke all on function public._apply_coupon(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- place_order: same as 032 plus p_coupon_code
-- ---------------------------------------------------------------------------
drop function if exists public.place_order(text, text, jsonb, jsonb, uuid, jsonb, jsonb);

create or replace function public.place_order(
  p_payment_method text,
  p_source text,
  p_items jsonb,
  p_shipping jsonb default null,
  p_sales_person_id uuid default null,
  p_cash_received jsonb default null,
  p_cash_change jsonb default null,
  p_coupon_code text default null
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
  v_coupon text := nullif(upper(btrim(coalesce(p_coupon_code, ''))), '');
  v_discount numeric := 0;
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

  -- A coupon bill is priced from MRP: POS manual discounts do not stack with it.
  v_total := public._apply_order_lines(v_order_id, p_items, p_source = 'POS' and v_coupon is null);

  if v_coupon is not null then
    v_total := public._apply_coupon(v_order_id, v_coupon, p_source, v_phone);
    select coupon_discount into v_discount from public.orders where id = v_order_id;
  end if;

  update public.orders set total_amount = v_total where id = v_order_id;

  if p_source = 'POS' and p_payment_method = 'CASH' then
    perform public._record_cash_sale(v_order_id, v_total, p_cash_received, p_cash_change);
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'total_amount', v_total,
    'coupon_code', case when v_coupon is null then null else v_coupon end,
    'coupon_discount', v_discount
  );
end;
$$;

revoke all on function public.place_order(text, text, jsonb, jsonb, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.place_order(text, text, jsonb, jsonb, uuid, jsonb, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin: how much each coupon has been used
-- ---------------------------------------------------------------------------
create or replace function public.coupon_stats()
returns table (coupon_id uuid, uses bigint, discount_total numeric, sales_total numeric, last_used timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  return query
  select o.coupon_id,
         count(*)::bigint,
         coalesce(sum(o.coupon_discount), 0)::numeric,
         coalesce(sum(o.total_amount), 0)::numeric,
         max(o.created_at)
  from public.orders o
  where o.coupon_id is not null
  group by o.coupon_id;
end;
$$;

revoke all on function public.coupon_stats() from public, anon;
grant execute on function public.coupon_stats() to authenticated;
