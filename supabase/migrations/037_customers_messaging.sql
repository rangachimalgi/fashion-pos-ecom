-- Customers + bill / birthday / anniversary / offer messages (WhatsApp click-to-send
-- and email) with personal coupons for the next visit.
--
-- - customers: one row per mobile number (email, birthday, anniversary, offers consent).
-- - coupons gain restricted_phone (personal codes) and issue_key (one coupon per
--   bill / per birthday per year, so re-sending never creates a second code).
-- - message_templates: editable text per message kind + the coupon it hands out.
-- - message_log: what was sent to whom.
--
-- Run after 036. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  phone text primary key check (phone ~ '^[6-9][0-9]{9}$'),
  name text not null default '',
  email text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  birthday date,
  anniversary date,
  marketing_opt_in boolean not null default false,
  opt_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
grant select on public.customers to authenticated;

drop policy if exists customers_admin_read on public.customers;
create policy customers_admin_read on public.customers
  for select to authenticated
  using (public.is_admin());

create or replace function public._save_customer(
  p_phone text,
  p_name text,
  p_email text,
  p_birthday date,
  p_anniversary date,
  p_opt_in boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit Indian mobile number.' using errcode = 'PT400';
  end if;
  if v_email is not null and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = 'PT400';
  end if;
  if p_birthday is not null and p_birthday > current_date then
    raise exception 'Birthday can''t be in the future.' using errcode = 'PT400';
  end if;

  insert into public.customers as c (
    phone, name, email, birthday, anniversary, marketing_opt_in, opt_in_at
  )
  values (
    v_phone,
    btrim(coalesce(p_name, '')),
    v_email,
    p_birthday,
    p_anniversary,
    coalesce(p_opt_in, false),
    case when coalesce(p_opt_in, false) then now() end
  )
  on conflict (phone) do update
     set name = coalesce(nullif(excluded.name, ''), c.name),
         email = coalesce(excluded.email, c.email),
         birthday = coalesce(excluded.birthday, c.birthday),
         anniversary = coalesce(excluded.anniversary, c.anniversary),
         marketing_opt_in = coalesce(p_opt_in, c.marketing_opt_in),
         opt_in_at = case
           when p_opt_in is true and not c.marketing_opt_in then now()
           when p_opt_in is false then null
           else c.opt_in_at
         end,
         updated_at = now();
end;
$$;

revoke all on function public._save_customer(text, text, text, date, date, boolean) from public, anon, authenticated;
grant execute on function public._save_customer(text, text, text, date, date, boolean) to service_role;

-- POS staff: save / look up a customer by mobile.
create or replace function public.save_customer(
  p_phone text,
  p_name text,
  p_email text default null,
  p_birthday date default null,
  p_anniversary date default null,
  p_opt_in boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  perform public._save_customer(p_phone, p_name, p_email, p_birthday, p_anniversary, p_opt_in);
end;
$$;

revoke all on function public.save_customer(text, text, text, date, date, boolean) from public, anon;
grant execute on function public.save_customer(text, text, text, date, date, boolean) to authenticated;

create or replace function public.get_customer(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_row jsonb;
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  select to_jsonb(c) into v_row from public.customers c where c.phone = v_phone;
  return v_row;
end;
$$;

revoke all on function public.get_customer(text) from public, anon;
grant execute on function public.get_customer(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Personal coupons
-- ---------------------------------------------------------------------------
alter table public.coupons
  add column if not exists restricted_phone text,
  add column if not exists issue_key text,
  add column if not exists issued_for text;

create unique index if not exists coupons_issue_key_key on public.coupons (issue_key) where issue_key is not null;

-- Same as 036 plus: a personal coupon only works for its own mobile number.
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
  if c.restricted_phone is not null then
    if v_phone !~ '^[6-9][0-9]{9}$' then
      raise exception 'Enter the customer''s mobile number to use coupon %.', v_code using errcode = 'PT400';
    end if;
    if v_phone <> c.restricted_phone then
      raise exception 'Coupon % belongs to a different mobile number.', v_code using errcode = 'PT400';
    end if;
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

-- ---------------------------------------------------------------------------
-- Message templates (one per kind)
-- ---------------------------------------------------------------------------
create table if not exists public.message_templates (
  kind text primary key check (kind in ('BILL', 'BIRTHDAY', 'ANNIVERSARY', 'OFFER')),
  whatsapp_body text not null,
  email_subject text not null,
  email_body text not null,
  coupon_enabled boolean not null default true,
  coupon_kind text not null default 'PERCENT' check (coupon_kind in ('PERCENT', 'FLAT')),
  coupon_value numeric(12,2) not null default 10 check (coupon_value > 0),
  coupon_max_discount numeric(12,2) check (coupon_max_discount is null or coupon_max_discount > 0),
  coupon_min_order numeric(12,2) not null default 0 check (coupon_min_order >= 0),
  coupon_valid_days integer not null default 30 check (coupon_valid_days between 1 and 365),
  -- OFFER only: share this existing code instead of making a personal one.
  offer_coupon_code text,
  updated_at timestamptz not null default now(),
  constraint message_templates_percent_max check (coupon_kind <> 'PERCENT' or coupon_value <= 100)
);

insert into public.message_templates (
  kind, whatsapp_body, email_subject, email_body,
  coupon_enabled, coupon_kind, coupon_value, coupon_max_discount, coupon_min_order, coupon_valid_days
)
values
(
  'BILL',
  E'Hi {name}, thank you for shopping at {shop}! 🙏\n\n*Bill {bill_no}* · {date}\n{items}\n*Total: ₹{total}*\nYou saved ₹{saved}\n\n🎁 Your next-visit gift: use code *{coupon}* for {coupon_offer}. Valid till {coupon_expiry}.\n\nSee you again soon!',
  'Your bill from {shop} · {bill_no}',
  E'Hi {name},\n\nThank you for shopping at {shop}!\n\nBill {bill_no} · {date}\n{items}\nTotal: ₹{total}\nYou saved ₹{saved}\n\nYour next-visit gift: use code {coupon} for {coupon_offer}. Valid till {coupon_expiry}.\n\nSee you again soon!',
  true, 'PERCENT', 10, 500, 1000, 30
),
(
  'BIRTHDAY',
  E'Happy Birthday {name}! 🎂🎉\n\nWishing you a wonderful year from all of us at {shop}.\n\nHere''s a birthday gift: use code *{coupon}* for {coupon_offer}. Valid till {coupon_expiry}.',
  'Happy Birthday, {name}! A gift from {shop} 🎂',
  E'Happy Birthday {name}!\n\nWishing you a wonderful year from all of us at {shop}.\n\nHere''s a birthday gift: use code {coupon} for {coupon_offer}. Valid till {coupon_expiry}.',
  true, 'PERCENT', 15, 1000, 0, 15
),
(
  'ANNIVERSARY',
  E'Happy Anniversary {name}! 💐\n\nCelebrate in style with {shop}. Use code *{coupon}* for {coupon_offer}. Valid till {coupon_expiry}.',
  'Happy Anniversary, {name}! 💐',
  E'Happy Anniversary {name}!\n\nCelebrate in style with {shop}. Use code {coupon} for {coupon_offer}. Valid till {coupon_expiry}.',
  true, 'PERCENT', 15, 1000, 0, 15
),
(
  'OFFER',
  E'Hi {name}! ✨ New arrivals are in at {shop}.\n\nUse code *{coupon}* for {coupon_offer}. Valid till {coupon_expiry}.\n\nVisit us or shop online.',
  'Something special for you at {shop}',
  E'Hi {name},\n\nNew arrivals are in at {shop}.\n\nUse code {coupon} for {coupon_offer}. Valid till {coupon_expiry}.\n\nVisit us or shop online.',
  true, 'PERCENT', 10, 500, 1500, 15
)
on conflict (kind) do nothing;

alter table public.message_templates enable row level security;
revoke all on public.message_templates from anon, authenticated;
grant select, update on public.message_templates to authenticated;

drop policy if exists message_templates_staff_read on public.message_templates;
create policy message_templates_staff_read on public.message_templates
  for select to authenticated
  using (public.is_staff());

drop policy if exists message_templates_admin_write on public.message_templates;
create policy message_templates_admin_write on public.message_templates
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Issue (or re-use) the personal coupon for a message
-- ---------------------------------------------------------------------------
create or replace function public._issue_customer_coupon(
  p_kind text,
  p_phone text,
  p_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_key text;
  v_prefix text;
  v_label text;
  v_code text;
  t public.message_templates%rowtype;
  c public.coupons%rowtype;
begin
  if p_kind is null or p_kind not in ('BILL', 'BIRTHDAY', 'ANNIVERSARY', 'OFFER') then
    raise exception 'Unknown message type' using errcode = 'PT400';
  end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit Indian mobile number.' using errcode = 'PT400';
  end if;

  select * into t from public.message_templates where kind = p_kind;
  if not found or not t.coupon_enabled then
    return null;
  end if;

  if p_kind = 'OFFER' and nullif(btrim(coalesce(t.offer_coupon_code, '')), '') is not null then
    select * into c from public.coupons where code = upper(btrim(t.offer_coupon_code));
    if not found or not c.active then
      raise exception 'The offer coupon % is missing or turned off. Fix it in Admin → Messages.',
        t.offer_coupon_code using errcode = 'PT400';
    end if;
  else
    v_key := case p_kind
      when 'BILL' then 'BILL:' || coalesce(p_order_id::text, '')
      when 'BIRTHDAY' then 'BIRTHDAY:' || v_phone || ':' || extract(year from v_today)
      when 'ANNIVERSARY' then 'ANNIVERSARY:' || v_phone || ':' || extract(year from v_today)
      else 'OFFER:' || v_phone || ':' || v_today
    end;
    if p_kind = 'BILL' and p_order_id is null then
      raise exception 'Bill messages need the order.' using errcode = 'PT400';
    end if;

    select * into c from public.coupons where issue_key = v_key;
    if not found then
      v_prefix := case p_kind
        when 'BILL' then 'NEXT'
        when 'BIRTHDAY' then 'BDAY'
        when 'ANNIVERSARY' then 'ANNIV'
        else 'EV'
      end;
      v_label := case p_kind
        when 'BILL' then 'Next-visit gift'
        when 'BIRTHDAY' then 'Birthday gift'
        when 'ANNIVERSARY' then 'Anniversary gift'
        else 'Special offer'
      end;

      loop
        v_code := v_prefix || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        exit when not exists (select 1 from public.coupons where code = v_code);
      end loop;

      insert into public.coupons (
        code, description, kind, value, max_discount, min_order,
        starts_on, ends_on, usage_limit, per_customer_limit, channel, active,
        restricted_phone, issue_key, issued_for
      )
      values (
        v_code, v_label, t.coupon_kind, t.coupon_value,
        case when t.coupon_kind = 'PERCENT' then t.coupon_max_discount end,
        t.coupon_min_order,
        case when p_kind = 'BILL' then v_today + 1 else v_today end,
        v_today + t.coupon_valid_days,
        1, 1, 'ALL', true,
        v_phone, v_key, p_kind
      )
      returning * into c;
    end if;
  end if;

  return jsonb_build_object(
    'code', c.code,
    'description', c.description,
    'kind', c.kind,
    'value', c.value,
    'max_discount', c.max_discount,
    'min_order', c.min_order,
    'starts_on', c.starts_on,
    'ends_on', c.ends_on
  );
end;
$$;

revoke all on function public._issue_customer_coupon(text, text, uuid) from public, anon, authenticated;
grant execute on function public._issue_customer_coupon(text, text, uuid) to service_role;

create or replace function public.issue_customer_coupon(
  p_kind text,
  p_phone text,
  p_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  if p_kind <> 'BILL' and not public.is_admin() then
    raise exception 'Only an admin can send birthday, anniversary or offer coupons.' using errcode = '42501';
  end if;
  return public._issue_customer_coupon(p_kind, p_phone, p_order_id);
end;
$$;

revoke all on function public.issue_customer_coupon(text, text, uuid) from public, anon;
grant execute on function public.issue_customer_coupon(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Message log
-- ---------------------------------------------------------------------------
create table if not exists public.message_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('BILL', 'BIRTHDAY', 'ANNIVERSARY', 'OFFER')),
  channel text not null check (channel in ('WHATSAPP', 'EMAIL')),
  phone text,
  email text,
  customer_name text,
  order_id uuid references public.orders (id) on delete set null,
  coupon_code text,
  -- WhatsApp click-to-send can only know the chat was opened, not that it was sent.
  status text not null check (status in ('OPENED', 'SENT', 'FAILED')),
  error text,
  sent_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists message_log_created_idx on public.message_log (created_at desc);
create index if not exists message_log_phone_idx on public.message_log (phone, kind);

alter table public.message_log enable row level security;
revoke all on public.message_log from anon, authenticated;
grant select on public.message_log to authenticated;

drop policy if exists message_log_admin_read on public.message_log;
create policy message_log_admin_read on public.message_log
  for select to authenticated
  using (public.is_admin());

create or replace function public.log_message(
  p_kind text,
  p_channel text,
  p_phone text,
  p_email text,
  p_customer_name text,
  p_order_id uuid,
  p_coupon_code text,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  insert into public.message_log (
    kind, channel, phone, email, customer_name, order_id, coupon_code, status, error
  )
  values (
    p_kind, p_channel, nullif(p_phone, ''), nullif(p_email, ''), nullif(p_customer_name, ''),
    p_order_id, nullif(p_coupon_code, ''), p_status, left(p_error, 500)
  );
end;
$$;

revoke all on function public.log_message(text, text, text, text, text, uuid, text, text, text) from public, anon;
grant execute on function public.log_message(text, text, text, text, text, uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: birthdays / anniversaries in the next N days
-- ---------------------------------------------------------------------------
create or replace function public.upcoming_occasions(p_days integer default 7)
returns table (
  phone text,
  name text,
  email text,
  marketing_opt_in boolean,
  kind text,
  occasion_on date,
  days_away integer,
  sent_this_year boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_days integer := least(greatest(coalesce(p_days, 7), 0), 60);
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  return query
  with days as (
    select (v_today + g)::date as day, g as away
    from generate_series(0, v_days) g
  ),
  hits as (
    select c.phone, c.name, c.email, c.marketing_opt_in, 'BIRTHDAY'::text as kind, d.day, d.away
    from public.customers c
    join days d
      on extract(month from c.birthday) = extract(month from d.day)
     and extract(day from c.birthday) = extract(day from d.day)
    where c.birthday is not null
    union all
    select c.phone, c.name, c.email, c.marketing_opt_in, 'ANNIVERSARY'::text, d.day, d.away
    from public.customers c
    join days d
      on extract(month from c.anniversary) = extract(month from d.day)
     and extract(day from c.anniversary) = extract(day from d.day)
    where c.anniversary is not null
  )
  select h.phone, h.name, h.email, h.marketing_opt_in, h.kind, h.day, h.away,
         exists (
           select 1 from public.message_log m
           where m.phone = h.phone
             and m.kind = h.kind
             and m.status in ('OPENED', 'SENT')
             and extract(year from (m.created_at at time zone 'Asia/Kolkata')) = extract(year from h.day)
         )
  from hits h
  order by h.away, h.name;
end;
$$;

revoke all on function public.upcoming_occasions(integer) from public, anon;
grant execute on function public.upcoming_occasions(integer) to authenticated;
