-- Receipt terms & conditions editable by an admin (shown on POS tax invoices).
-- Staff can read them for printing; only admins can change them.
-- Safe to re-run.

create table if not exists public.receipt_settings (
  id boolean primary key default true check (id),
  terms text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

insert into public.receipt_settings (id, terms)
values (
  true,
  array[
    'First Wash Dry Wash',
    'No Guarantee on Fancy Fabrics',
    'Do not Remove Price Tag in case of Exchange',
    'Altered Goods will not be Exchanged',
    'Exchange Period : 2 days (2pm to 9pm)',
    'Strictly No Refund on Exchange.'
  ]
)
on conflict (id) do nothing;

alter table public.receipt_settings enable row level security;
revoke all on public.receipt_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read (any signed-in staff — POS needs this to print)
-- ---------------------------------------------------------------------------

create or replace function public.get_receipt_terms()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_terms text[];
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;

  select s.terms into v_terms
  from public.receipt_settings s
  where s.id;

  return coalesce(v_terms, '{}'::text[]);
end;
$$;

revoke all on function public.get_receipt_terms() from public, anon;
grant execute on function public.get_receipt_terms() to authenticated;

-- ---------------------------------------------------------------------------
-- Write (admin only)
-- ---------------------------------------------------------------------------

create or replace function public.set_receipt_terms(p_terms text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text[] := '{}'::text[];
  v_line text;
  v_trimmed text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can edit receipt terms.' using errcode = 'PT403';
  end if;

  if p_terms is null then
    raise exception 'Send the list of terms.' using errcode = 'PT400';
  end if;

  if coalesce(array_length(p_terms, 1), 0) > 20 then
    raise exception 'Keep receipt terms to 20 lines or fewer.' using errcode = 'PT400';
  end if;

  if p_terms is not null then
    foreach v_line in array p_terms loop
      v_trimmed := btrim(coalesce(v_line, ''));
      if v_trimmed = '' then
        continue;
      end if;
      if char_length(v_trimmed) > 160 then
        raise exception 'Each term must be 160 characters or fewer.' using errcode = 'PT400';
      end if;
      v_clean := array_append(v_clean, v_trimmed);
    end loop;
  end if;

  insert into public.receipt_settings (id, terms, updated_at)
  values (true, v_clean, now())
  on conflict (id) do update
    set terms = excluded.terms,
        updated_at = now();

  return v_clean;
end;
$$;

revoke all on function public.set_receipt_terms(text[]) from public, anon;
grant execute on function public.set_receipt_terms(text[]) to authenticated;
