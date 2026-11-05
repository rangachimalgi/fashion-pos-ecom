-- ₹200 notes on the POS cash desk.

insert into public.cash_drawer (denomination)
values (200)
on conflict (denomination) do nothing;
