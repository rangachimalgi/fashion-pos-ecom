import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartItem } from "@/store/useCartStore";
import { clampDiscountPercent } from "@/lib/posPricing";
import { toCheckoutError } from "@/lib/placeOrder";
import type { AdminOrder, PaymentMethod } from "@/types/order";
import type { CompleteProduct, ProductVariant } from "@/types/product";

// Stock + order changes happen inside Postgres functions (see
// supabase/migrations/013_*.sql): one transaction, row locks, and a staff-role
// check. Nothing here touches stock or order rows directly any more.

export async function deletePosOrder(
  supabase: SupabaseClient,
  order: AdminOrder
) {
  if (order.source !== "POS") throw new Error("Only POS bills can be deleted here.");

  const { error } = await supabase.rpc("delete_pos_order", { p_order_id: order.id });
  if (error) throw toCheckoutError(error);
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
    /** Omit / null to keep the bill's current salesperson. */
    sales_person_id?: string | null;
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

  const { error } = await supabase.rpc("update_pos_order", {
    p_order_id: order.id,
    p_payment_method: next.payment_method,
    p_items: items,
    p_sales_person_id: next.sales_person_id ?? null,
  });
  if (error) throw toCheckoutError(error);
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
