-- Admin-managed product types (Tshirts, Shirts, …) per department.
-- Run in the Supabase SQL Editor.

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  department text not null check (department in ('Men', 'Women', 'Kids')),
  name text not null,
  slug text not null,
  image_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (department, slug)
);

alter table public.product_categories enable row level security;

drop policy if exists "Anyone can read product categories" on public.product_categories;
create policy "Anyone can read product categories"
  on public.product_categories
  for select
  using (true);

drop policy if exists "Allow anonymous category inserts" on public.product_categories;
create policy "Allow anonymous category inserts"
  on public.product_categories
  for insert
  with check (true);

drop policy if exists "Allow anonymous category updates" on public.product_categories;
create policy "Allow anonymous category updates"
  on public.product_categories
  for update
  using (true)
  with check (true);

drop policy if exists "Allow anonymous category deletes" on public.product_categories;
create policy "Allow anonymous category deletes"
  on public.product_categories
  for delete
  using (true);

insert into public.product_categories (department, name, slug, image_url, sort_order)
values
  ('Men', 'Tshirts', 'tshirts', '/categories/tshirts.jpg', 1),
  ('Men', 'Shirts', 'shirts', '/categories/shirts.jpg', 2),
  ('Men', 'Jeans', 'jeans', '/categories/jeans.jpg', 3),
  ('Men', 'Hoodies', 'hoodies', '/categories/hoodies.jpg', 4),
  ('Women', 'Tops', 'tops', '/categories/tshirts.jpg', 1),
  ('Women', 'Dresses', 'dresses', '/categories/shirts.jpg', 2),
  ('Women', 'Kurtis', 'kurtis', '/categories/hoodies.jpg', 3),
  ('Women', 'Jeans', 'jeans', '/categories/jeans.jpg', 4),
  ('Kids', 'Tshirts', 'tshirts', '/categories/tshirts.jpg', 1),
  ('Kids', 'Shorts', 'shorts', '/categories/shirts.jpg', 2),
  ('Kids', 'Dresses', 'dresses', '/categories/hoodies.jpg', 3),
  ('Kids', 'Sets', 'sets', '/categories/jeans.jpg', 4)
on conflict (department, slug) do nothing;
