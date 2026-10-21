-- Style code + distributor Rate / cost. Run in the Supabase SQL Editor.

alter table public.products
  add column if not exists style_code text;

alter table public.products
  add column if not exists cost_price numeric(12,2);
