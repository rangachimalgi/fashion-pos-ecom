-- Staff profiles for /login (admin vs staff). Run in the SQL Editor after creating Auth users.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'staff')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Existing Auth users (created before this trigger) get a staff row:
insert into public.profiles (user_id, role)
select id, 'staff'
from auth.users
on conflict (user_id) do nothing;

-- Promote the first login (replace the email):
-- update public.profiles p
-- set role = 'admin'
-- from auth.users u
-- where p.user_id = u.id and u.email = 'you@yourshop.com';
