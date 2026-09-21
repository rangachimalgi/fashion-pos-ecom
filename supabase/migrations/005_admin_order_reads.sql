-- Read policies so the admin orders list can load with the same anon key as catalog.

do $$
begin
  if to_regclass('public.orders') is not null then
    execute 'alter table orders enable row level security';
    execute 'drop policy if exists "Allow anonymous order reads" on orders';
    execute 'create policy "Allow anonymous order reads" on orders for select using (true)';
  end if;

  if to_regclass('public.order_items') is not null then
    execute 'alter table order_items enable row level security';
    execute 'drop policy if exists "Allow anonymous order item reads" on order_items';
    execute 'create policy "Allow anonymous order item reads" on order_items for select using (true)';
  end if;
end $$;
