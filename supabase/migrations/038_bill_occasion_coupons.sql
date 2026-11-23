-- Bill messages in a customer's birthday / anniversary month also carry that
-- occasion's coupon (same yearly code as the birthday / anniversary wish, so the
-- customer never gets two). Only for customers who agreed to receive offers.
-- Run after 037. Safe to re-run.

create or replace function public._bill_occasion_coupons(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_month integer := extract(month from (now() at time zone 'Asia/Kolkata'));
  v_out jsonb := '[]'::jsonb;
  v_coupon jsonb;
  c public.customers%rowtype;
begin
  select * into c from public.customers where phone = v_phone;
  if not found or not c.marketing_opt_in then
    return v_out;
  end if;

  if c.birthday is not null and extract(month from c.birthday) = v_month then
    v_coupon := public._issue_customer_coupon('BIRTHDAY', v_phone, null);
    if v_coupon is not null then
      v_out := v_out || jsonb_build_array(v_coupon || jsonb_build_object('occasion', 'BIRTHDAY'));
    end if;
  end if;

  if c.anniversary is not null and extract(month from c.anniversary) = v_month then
    v_coupon := public._issue_customer_coupon('ANNIVERSARY', v_phone, null);
    if v_coupon is not null then
      v_out := v_out || jsonb_build_array(v_coupon || jsonb_build_object('occasion', 'ANNIVERSARY'));
    end if;
  end if;

  return v_out;
end;
$$;

revoke all on function public._bill_occasion_coupons(text) from public, anon, authenticated;
grant execute on function public._bill_occasion_coupons(text) to service_role;

create or replace function public.bill_occasion_coupons(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff sign-in required' using errcode = '42501';
  end if;
  return public._bill_occasion_coupons(p_phone);
end;
$$;

revoke all on function public.bill_occasion_coupons(text) from public, anon;
grant execute on function public.bill_occasion_coupons(text) to authenticated;
