import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { CheckoutError, placeOrder } from '@/lib/placeOrder';
import type { CheckoutRequest } from '@/types/order';
import { validateEmail } from '@/lib/messaging';

/**
 * Public online checkout (web bag + mobile app).
 *
 * This endpoint can only ever create ONLINE orders at catalog prices:
 * `source` is forced and any client-sent `unit_price` is dropped. POS bills
 * are posted by signed-in staff straight to the `place_order` database
 * function, which checks their role.
 */
export async function POST(request: Request) {
  let body: Partial<CheckoutRequest>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  try {
    const result = await placeOrder(getSupabaseAdmin(), {
      payment_method: body.payment_method as CheckoutRequest['payment_method'],
      source: 'ONLINE',
      items: body.items.map((item) => ({
        variant_id: item?.variant_id,
        quantity: item?.quantity,
      })),
      shipping: body.shipping,
      coupon_code: typeof body.coupon_code === 'string' ? body.coupon_code : null,
    });

    // Optional email + offers consent; the order is already placed, so never fail on this.
    const profile = (body as { customer_profile?: { email?: unknown; opt_in?: unknown } }).customer_profile;
    if (body.shipping?.customer_phone) {
      const email = typeof profile?.email === 'string' ? profile.email.trim() : '';
      const { error } = await getSupabaseAdmin().rpc('_save_customer', {
        p_phone: body.shipping.customer_phone,
        p_name: body.shipping.customer_name ?? '',
        p_email: email && !validateEmail(email) ? email : null,
        p_birthday: null,
        p_anniversary: null,
        p_opt_in: profile?.opt_in === true ? true : null,
      });
      if (error) console.warn('[checkout] customer profile not saved', error.message);
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CheckoutError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[checkout] unexpected error', err);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
