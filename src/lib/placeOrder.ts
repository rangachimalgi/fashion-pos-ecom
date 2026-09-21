import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckoutRequest, CheckoutResponse, PaymentMethod, OrderSource } from "@/types/order";

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "UPI"];
const ORDER_SOURCES: OrderSource[] = ["ONLINE", "POS"];

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

function schemaHint(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("does not exist") || lower.includes("schema cache") || lower.includes("order_items")) {
    return "\n\nRun supabase/migrations/006_orders.sql in the Supabase SQL Editor.";
  }
  if (lower.includes("policy") || lower.includes("42501")) {
    return "\n\nRun supabase/migrations/006_orders.sql in the Supabase SQL Editor.";
  }
  return "";
}

export async function placeOrder(
  supabase: SupabaseClient,
  body: CheckoutRequest
): Promise<CheckoutResponse> {
  const { payment_method, source, items } = body;

  if (!PAYMENT_METHODS.includes(payment_method)) {
    throw new Error("payment_method must be CASH or UPI");
  }

  if (!ORDER_SOURCES.includes(source)) {
    throw new Error("source must be ONLINE or POS");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart is empty");
  }

  const normalizedItems = items.map((item) => ({
    variant_id: String(item.variant_id ?? ""),
    quantity: Number(item.quantity),
  }));

  if (
    normalizedItems.some(
      (item) => !item.variant_id || !Number.isInteger(item.quantity) || item.quantity < 1
    )
  ) {
    throw new Error("Each item needs a variant_id and a quantity of 1+");
  }

  const variantIds = [...new Set(normalizedItems.map((item) => item.variant_id))];

  const { data: variants, error: variantError } = await supabase
    .from("product_variants")
    .select("id, stock_quantity, products(id, name, base_price)")
    .in("id", variantIds);

  if (variantError) throw new Error(variantError.message + schemaHint(variantError.message));

  const variantMap = new Map(
    ((variants ?? []) as unknown as VariantRow[]).map((row) => [row.id, row])
  );

  if (variantMap.size !== variantIds.length) {
    throw new Error("One or more variants were not found");
  }

  const lineItems: Array<{
    variant_id: string;
    quantity: number;
    price_at_purchase: number;
  }> = [];

  for (const item of normalizedItems) {
    const variant = variantMap.get(item.variant_id);
    const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
    if (!variant || !product) {
      throw new Error("Variant is missing its parent product");
    }

    if (variant.stock_quantity < item.quantity) {
      throw new Error(`Not enough stock for ${product.name}. Available: ${variant.stock_quantity}`);
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
    .from("orders")
    .insert({
      total_amount: totalAmount,
      payment_method,
      source,
    })
    .select("id, total_amount")
    .single();

  if (orderError || !order) {
    const message = orderError?.message || "Order was not created";
    throw new Error(message + schemaHint(message));
  }

  const orderId = order.id as string;

  const { error: itemsError } = await supabase.from("order_items").insert(
    lineItems.map((item) => ({
      ...item,
      order_id: orderId,
    }))
  );

  if (itemsError) {
    await supabase.from("orders").delete().eq("id", orderId);
    throw new Error(itemsError.message + schemaHint(itemsError.message));
  }

  for (const item of lineItems) {
    const variant = variantMap.get(item.variant_id)!;
    const nextStock = variant.stock_quantity - item.quantity;

    const { data: updatedRows, error: stockError } = await supabase
      .from("product_variants")
      .update({ stock_quantity: nextStock, updated_at: new Date().toISOString() })
      .eq("id", item.variant_id)
      .gte("stock_quantity", item.quantity)
      .select("id");

    if (stockError || !updatedRows?.length) {
      await supabase.from("order_items").delete().eq("order_id", orderId);
      await supabase.from("orders").delete().eq("id", orderId);
      throw new Error(
        stockError?.message ?? "Stock changed during checkout. Order was rolled back."
      );
    }
  }

  return {
    order_id: orderId,
    total_amount: Number(order.total_amount ?? totalAmount),
  };
}
