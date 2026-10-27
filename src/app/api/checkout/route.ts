import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { CheckoutError, placeOrder } from '@/lib/placeOrder';
import type { CheckoutRequest } from '@/types/order';

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
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CheckoutError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[checkout] unexpected error', err);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
