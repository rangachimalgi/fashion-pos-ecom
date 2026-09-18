-- Allow admin panel to update / delete catalog rows (anon key, same as inserts).

drop policy if exists "Allow anonymous product updates" on products;
drop policy if exists "Allow anonymous product deletes" on products;
drop policy if exists "Allow anonymous variant updates" on product_variants;
drop policy if exists "Allow anonymous variant deletes" on product_variants;

create policy "Allow anonymous product updates" on products
  for update using (true) with check (true);

create policy "Allow anonymous product deletes" on products
  for delete using (true);

create policy "Allow anonymous variant updates" on product_variants
  for update using (true) with check (true);

create policy "Allow anonymous variant deletes" on product_variants
  for delete using (true);
