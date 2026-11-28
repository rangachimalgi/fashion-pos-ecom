-- Base catalog. The original project created these tables in the dashboard,
-- so a brand-new Supabase project has to create them before 001.
-- Later migrations add department, photos, cost, and the POS quick-item columns.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  brand text not null default '',
  base_price numeric(12,2) not null,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  size text not null,
  color text not null,
  barcode text not null unique,
  stock_quantity integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists product_variants_product_id_idx
  on public.product_variants (product_id);
