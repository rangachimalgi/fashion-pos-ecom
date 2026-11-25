import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompleteProduct, ProductVariant } from "@/types/product";
import { toCheckoutError } from "@/lib/placeOrder";
import { canonicalSize } from "@/lib/sizes";

export const QUICK_ITEM_NAMES = ["T-shirt", "Shirt", "Jeans", "Trouser", "Kurti", "Saree", "Leggings", "Dupatta"];

export type QuickItemInput = {
  name: string;
  price: number;
  quantity: number;
  size?: string | null;
};

export function validateQuickItem(input: QuickItemInput): string | null {
  const name = input.name.trim();
  if (name.length < 2) return "Enter what the item is (e.g. T-shirt).";
  if (name.length > 80) return "Keep the name under 80 letters.";
  if (!(input.price > 0)) return "Enter the price.";
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 999) {
    return "Quantity must be between 1 and 999.";
  }
  return null;
}

/** Creates a POS-only catalog item (hidden from the online shop) and returns it ready for the ticket. */
export async function quickAddItem(
  supabase: SupabaseClient,
  input: QuickItemInput
): Promise<{ product: CompleteProduct; variant: ProductVariant }> {
  const { data, error } = await supabase.rpc("pos_quick_add_item", {
    p_name: input.name.trim(),
    p_price: input.price,
    p_quantity: input.quantity,
    p_size: input.size?.trim() ? canonicalSize(input.size) : null,
  });
  if (error) {
    if (error.code === "PGRST202" || /could not find/i.test(error.message)) {
      throw new Error("Run supabase/migrations/039_pos_quick_items.sql in the Supabase SQL Editor first.");
    }
    throw toCheckoutError(error);
  }
  const row = data as { product: Record<string, unknown>; variant: Record<string, unknown> };
  const variant = {
    ...(row.variant as unknown as ProductVariant),
    stock_quantity: Number(row.variant.stock_quantity ?? input.quantity),
  };
  const product = {
    ...(row.product as unknown as CompleteProduct),
    base_price: Number(row.product.base_price),
    cost_price: null,
    variants: [variant],
  };
  return { product, variant };
}
