import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeScanCode } from "@/lib/productAdmin";
import type { CompleteProduct, ProductVariant } from "@/types/product";

export type PosLookupHit = {
  product: CompleteProduct;
  variant: ProductVariant;
};

export async function lookupPosByEan(
  supabase: SupabaseClient,
  rawCode: string
): Promise<PosLookupHit | null> {
  const code = normalizeScanCode(rawCode);
  if (code.length < 4) return null;

  const { data, error } = await supabase
    .from("product_variants")
    .select("*, products(*)")
    .eq("barcode", code)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const productRow = Array.isArray(data.products) ? data.products[0] : data.products;
  if (!productRow) return null;

  const { products: _ignored, ...variant } = data as ProductVariant & {
    products: unknown;
  };

  return {
    product: { ...productRow, variants: [variant] } as CompleteProduct,
    variant: variant as ProductVariant,
  };
}
