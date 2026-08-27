-- Product insert policies for POS /add-product (anon key).
-- Already applied on the live project; kept here as the source of truth.

alter table products enable row level security;
alter table product_variants enable row level security;

drop policy if exists "Allow anonymous product insertions" on products;
drop policy if exists "Allow anonymous variant insertions" on product_variants;

create policy "Allow anonymous product insertions" on products
  for insert with check (true);

create policy "Allow anonymous variant insertions" on product_variants
  for insert with check (true);
