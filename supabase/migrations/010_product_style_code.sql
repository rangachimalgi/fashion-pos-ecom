-- Optional distributor style / product code (XYRK0072-W1-82F).
-- EAN / barcode already lives on product_variants.barcode.
-- Run in the Supabase SQL Editor.

alter table public.products
  add column if not exists style_code text;
