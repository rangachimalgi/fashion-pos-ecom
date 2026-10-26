-- POS history edit: change payment / total on an existing bill.

alter table public.orders enable row level security;

drop policy if exists "Allow anonymous order updates" on public.orders;
create policy "Allow anonymous order updates" on public.orders
  for update using (true) with check (true);

alter table public.order_items enable row level security;

drop policy if exists "Allow anonymous order item updates" on public.order_items;
create policy "Allow anonymous order item updates" on public.order_items
  for update using (true) with check (true);
