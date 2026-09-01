-- Up to 6 gallery images per product (image_url remains the primary / legacy cover).

alter table products
  add column if not exists image_urls text[] default '{}';

update products
set image_urls = array[image_url]
where image_url is not null
  and (image_urls is null or image_urls = '{}');
