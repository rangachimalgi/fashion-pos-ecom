-- 024: SECURITY FIX - is_admin() must be true or false, never null.
-- Requires 014. Safe to re-run. RUN THIS BEFORE ANYTHING ELSE IN THIS BATCH.
--
-- Bug: for a signed-in user with no row in public.profiles, staff_role() is
-- null, so is_admin() returned null instead of false. Functions that guard
-- themselves with  `if not public.is_admin() then raise ...`  read
-- `not null` as "don't raise", so ANY signed-in account (for example someone
-- who signed up with the public anon key) could run the admin-only functions
-- from 016 to 021: sales / margin / GST reports, set_cash_drawer, save_supplier,
-- save_purchase and delete_purchase. (RLS policies were not affected: a null
-- policy result already means "no".)
--
-- Fix: one place. Every function above calls is_admin(), so redefining it
-- closes all of them.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.staff_role() = 'admin', false);
$$;
