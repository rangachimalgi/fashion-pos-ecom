import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { CheckoutRequest, OrderSource, PaymentMethod } from '@/types/order';

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'UPI'];
const ORDER_SOURCES: OrderSource[] = ['ONLINE', 'POS'];

type ProductRow = {
  id: string;
  name: string;
  base_price: number;
};

type VariantRow = {
  id: string;
  stock_quantity: number;
  products: ProductRow | ProductRow[] | null;
};

export async function POST(request: Request) {
  let body: CheckoutRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { payment_method, source, items } = body;

  if (!PAYMENT_METHODS.includes(payment_method)) {
    return NextResponse.json({ error: 'payment_method must be CASH or UPI' }, { status: 400 });
  }

  if (!ORDER_SOURCES.includes(source)) {
    return NextResponse.json({ error: 'source must be ONLINE or POS' }, { status: 400 });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  const normalizedItems = items.map((item) => ({
    variant_id: String(item.variant_id ?? ''),
    quantity: Number(item.quantity),
  }));

  if (normalizedItems.some((item) => !item.variant_id || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    return NextResponse.json({ error: 'Each item needs a variant_id and a quantity of 1+' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const variantIds = [...new Set(normalizedItems.map((item) => item.variant_id))];

  const { data: variants, error: variantError } = await supabase
    .from('product_variants')
    .select('id, stock_quantity, products(id, name, base_price)')
    .in('id', variantIds);

  if (variantError) {
    return NextResponse.json({ error: variantError.message }, { status: 500 });
  }

  const variantMap = new Map(
    ((variants ?? []) as unknown as VariantRow[]).map((row) => [row.id, row])
  );

  if (variantMap.size !== variantIds.length) {
    return NextResponse.json({ error: 'One or more variants were not found' }, { status: 400 });
  }

  const lineItems = [];

  for (const item of normalizedItems) {
    const variant = variantMap.get(item.variant_id);
    const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
    if (!variant || !product) {
      return NextResponse.json({ error: 'Variant is missing its parent product' }, { status: 400 });
    }

    if (variant.stock_quantity < item.quantity) {
      return NextResponse.json(
        {
          error: `Not enough stock for ${product.name}. Available: ${variant.stock_quantity}`,
        },
        { status: 409 }
      );
    }

    lineItems.push({
      variant_id: item.variant_id,
      quantity: item.quantity,
      price_at_purchase: Number(product.base_price),
    });
  }

  const totalAmount = lineItems.reduce(
    (sum, item) => sum + item.price_at_purchase * item.quantity,
    0
  );

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      total_amount: totalAmount,
      payment_method,
      source,
      order_items: lineItems,
    })
    .select('id, total_amount')
    .single();

  let orderId = order?.id as string | undefined;
  let persistedTotal = order?.total_amount as number | undefined;

  if (orderError) {
    const { data: fallbackOrder, error: fallbackOrderError } = await supabase
      .from('orders')
      .insert({
        total_amount: totalAmount,
        payment_method,
        source,
      })
      .select('id, total_amount')
      .single();

    if (fallbackOrderError || !fallbackOrder) {
      return NextResponse.json(
        { error: fallbackOrderError?.message ?? orderError.message },
        { status: 500 }
      );
    }

    orderId = fallbackOrder.id;
    persistedTotal = fallbackOrder.total_amount;

    const { error: itemsError } = await supabase.from('order_items').insert(
      lineItems.map((item) => ({
        ...item,
        order_id: orderId,
      }))
    );

    if (itemsError) {
      await supabase.from('orders').delete().eq('id', orderId);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
  }

  if (!orderId) {
    return NextResponse.json({ error: 'Order was not created' }, { status: 500 });
  }

  for (const item of lineItems) {
    const variant = variantMap.get(item.variant_id)!;
    const nextStock = variant.stock_quantity - item.quantity;

    const { data: updatedRows, error: stockError } = await supabase
      .from('product_variants')
      .update({ stock_quantity: nextStock, updated_at: new Date().toISOString() })
      .eq('id', item.variant_id)
      .gte('stock_quantity', item.quantity)
      .select('id');

    if (stockError || !updatedRows?.length) {
      await supabase.from('order_items').delete().eq('order_id', orderId);
      await supabase.from('orders').delete().eq('id', orderId);

      return NextResponse.json(
        {
          error: stockError?.message ?? 'Stock changed during checkout. Order was rolled back.',
        },
        { status: 409 }
      );
    }
  }

  return NextResponse.json({
    order_id: orderId,
    total_amount: Number(persistedTotal ?? totalAmount),
  });
}
