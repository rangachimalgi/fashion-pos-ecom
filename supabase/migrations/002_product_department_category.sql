-- Department (Men/Women/Kids) + category (Tshirts/Shirts/Jeans/Hoodies).
-- REQUIRED for homepage filters and POS taxonomy fields.

alter table products
  add column if not exists department text,
  add column if not exists category text;

update products
set department = 'Men'
where department is null;

create index if not exists products_department_idx on products (department);
create index if not exists products_category_idx on products (category);
