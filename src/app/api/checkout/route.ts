import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { placeOrder } from '@/lib/placeOrder';
import type { CheckoutRequest } from '@/types/order';

export async function POST(request: Request) {
  let body: CheckoutRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const result = await placeOrder(getSupabaseAdmin(), body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed';
    const status =
      message.includes('empty') ||
      message.includes('must be') ||
      message.includes('not found') ||
      message.includes('quantity')
        ? 400
        : message.includes('Not enough stock') || message.includes('Stock changed')
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
