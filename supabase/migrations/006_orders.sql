-- Orders + line items for POS and bag checkout (browser anon key).

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  total_amount numeric(12,2) not null,
  payment_method text not null,
  source text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null,
  quantity integer not null check (quantity > 0),
  price_at_purchase numeric(12,2) not null
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Allow anonymous order reads" on public.orders;
drop policy if exists "Allow anonymous order inserts" on public.orders;
drop policy if exists "Allow anonymous order deletes" on public.orders;
drop policy if exists "Allow anonymous order item reads" on public.order_items;
drop policy if exists "Allow anonymous order item inserts" on public.order_items;
drop policy if exists "Allow anonymous order item deletes" on public.order_items;

create policy "Allow anonymous order reads" on public.orders
  for select using (true);

create policy "Allow anonymous order inserts" on public.orders
  for insert with check (true);

create policy "Allow anonymous order deletes" on public.orders
  for delete using (true);

create policy "Allow anonymous order item reads" on public.order_items
  for select using (true);

create policy "Allow anonymous order item inserts" on public.order_items
  for insert with check (true);

create policy "Allow anonymous order item deletes" on public.order_items
  for delete using (true);
