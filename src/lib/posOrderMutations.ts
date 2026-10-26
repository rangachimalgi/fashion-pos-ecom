import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartItem } from "@/store/useCartStore";
import { clampDiscountPercent } from "@/lib/posPricing";
import type { AdminOrder, PaymentMethod } from "@/types/order";
import type { CompleteProduct, ProductVariant } from "@/types/product";

async function bumpStock(
  supabase: SupabaseClient,
  variantId: string,
  delta: number
) {
  if (!delta) return;
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, stock_quantity")
    .eq("id", variantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("A size on this bill is no longer in the catalog.");

  const next = Number(data.stock_quantity ?? 0) + delta;
  if (next < 0) {
    throw new Error("Not enough stock to increase that quantity.");
  }

  const { error: updateError } = await supabase
    .from("product_variants")
    .update({ stock_quantity: next, updated_at: new Date().toISOString() })
    .eq("id", variantId);
  if (updateError) throw new Error(updateError.message);
}

export async function deletePosOrder(
  supabase: SupabaseClient,
  order: AdminOrder
) {
  if (order.source !== "POS") throw new Error("Only POS bills can be deleted here.");

  for (const line of order.items) {
    await bumpStock(supabase, line.variant_id, line.quantity);
  }

  const { error } = await supabase.from("orders").delete().eq("id", order.id);
  if (error) {
    throw new Error(
      error.message +
        (error.message.toLowerCase().includes("policy") || error.code === "42501"
          ? "\n\nRun supabase/migrations/012_pos_order_updates.sql in the Supabase SQL Editor."
          : "")
    );
  }
}

export type PosOrderEditLine = {
  variant_id: string;
  quantity: number;
  unit_price: number;
};

export async function updatePosOrder(
  supabase: SupabaseClient,
  order: AdminOrder,
  next: {
    payment_method: PaymentMethod;
    items: PosOrderEditLine[];
  }
) {
  if (order.source !== "POS") throw new Error("Only POS bills can be edited here.");
  if (!next.items.length) throw new Error("A bill needs at least one item.");

  const items = next.items.map((line) => ({
    variant_id: line.variant_id,
    quantity: Math.max(1, Math.floor(Number(line.quantity))),
    unit_price: Math.round(Number(line.unit_price) * 100) / 100,
  }));

  if (items.some((line) => !line.variant_id || line.quantity < 1 || line.unit_price < 0)) {
    throw new Error("Each line needs a quantity of 1+ and a valid price.");
  }

  for (const line of order.items) {
    await bumpStock(supabase, line.variant_id, line.quantity);
  }

  try {
    for (const line of items) {
      await bumpStock(supabase, line.variant_id, -line.quantity);
    }
  } catch (err) {
    for (const line of order.items) {
      await bumpStock(supabase, line.variant_id, -line.quantity);
    }
    throw err;
  }

  const { error: clearError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", order.id);
  if (clearError) throw new Error(clearError.message);

  const total = items.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);

  const { error: insertError } = await supabase.from("order_items").insert(
    items.map((line) => ({
      order_id: order.id,
      variant_id: line.variant_id,
      quantity: line.quantity,
      price_at_purchase: line.unit_price,
    }))
  );
  if (insertError) throw new Error(insertError.message);

  const { data: updatedRows, error: orderError } = await supabase
    .from("orders")
    .update({
      payment_method: next.payment_method,
      total_amount: Math.round(total * 100) / 100,
    })
    .eq("id", order.id)
    .select("id");
  if (orderError || !updatedRows?.length) {
    const message = orderError?.message ?? "This bill total was not saved.";
    throw new Error(
      message +
        (message.toLowerCase().includes("policy") ||
        orderError?.code === "42501" ||
        !updatedRows?.length
          ? "\n\nRun supabase/migrations/012_pos_order_updates.sql in the Supabase SQL Editor."
          : "")
    );
  }
}

export function reservedQtyOnOrder(order: AdminOrder | null, variantId: string) {
  if (!order) return 0;
  return order.items
    .filter((line) => line.variant_id === variantId)
    .reduce((sum, line) => sum + Number(line.quantity), 0);
}

export async function ticketFromOrder(
  supabase: SupabaseClient,
  order: AdminOrder
): Promise<CartItem[]> {
  const variantIds = [...new Set(order.items.map((line) => line.variant_id))];
  if (!variantIds.length) return [];

  const { data, error } = await supabase
    .from("product_variants")
    .select("*, products(*)")
    .in("id", variantIds);
  if (error) throw new Error(error.message);

  const byId = new Map((data ?? []).map((row) => [String((row as { id: string }).id), row]));
  const items: CartItem[] = [];

  for (const line of order.items) {
    const row = byId.get(line.variant_id) as
      | (ProductVariant & { products?: CompleteProduct | CompleteProduct[] | null })
      | undefined;
    if (!row) throw new Error("A size on this bill is no longer in the catalog.");

    const productRow = Array.isArray(row.products) ? row.products[0] : row.products;
    if (!productRow) throw new Error("A product on this bill is no longer in the catalog.");

    const { products: _ignored, ...variant } = row;
    const mrp = Number(productRow.base_price);
    const unit = Number(line.price_at_purchase);
    const discountPercent = clampDiscountPercent(
      mrp > 0 ? Math.round((1 - unit / mrp) * 100) : 0
    );
    const reserved = reservedQtyOnOrder(order, line.variant_id);
    const existing = items.find((item) => item.variant.id === line.variant_id);
    if (existing) {
      existing.quantity += line.quantity;
      continue;
    }

    const costRaw = productRow.cost_price;
    const { variants: _variants, ...parent } = productRow;
    items.push({
      product: {
        ...parent,
        cost_price: costRaw == null ? null : Number(costRaw),
      },
      variant: {
        ...(variant as ProductVariant),
        stock_quantity: Number(variant.stock_quantity ?? 0) + reserved,
      },
      quantity: line.quantity,
      discountPercent,
    });
  }

  return items;
}
