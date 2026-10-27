import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompleteProduct, ProductVariant } from "@/types/product";

export type PosSearchResult = {
  product: CompleteProduct;
  /** Set when the product was found through a barcode, so we can highlight that size. */
  matchedVariantId: string | null;
};

const MAX_RESULTS = 8;

/** Strip characters that would break a PostgREST filter string. */
export function cleanSearchQuery(raw: string) {
  return raw
    .replace(/[,()*%\\"':]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ProductRow = Omit<CompleteProduct, "variants"> & {
  cost_price?: number | string | null;
  product_variants?: ProductVariant[] | null;
};

function toProduct(row: ProductRow): CompleteProduct {
  const { product_variants, ...rest } = row;
  const variants = [...(product_variants ?? [])].sort((a, b) =>
    String(a.size).localeCompare(String(b.size), undefined, { numeric: true })
  );
  return {
    ...(rest as Omit<CompleteProduct, "variants">),
    cost_price: row.cost_price == null ? null : Number(row.cost_price),
    variants,
  };
}

/**
 * Suggestions for the POS box: matches product name, brand or style code
 * (every typed word must match somewhere) and, for a single word, barcodes.
 */
export async function searchPosProducts(
  supabase: SupabaseClient,
  raw: string
): Promise<PosSearchResult[]> {
  const q = cleanSearchQuery(raw);
  if (q.length < 2) return [];

  const terms = q.split(" ").slice(0, 4);

  let textQuery = supabase.from("products").select("*, product_variants(*)");
  for (const term of terms) {
    textQuery = textQuery.or(
      `name.ilike.%${term}%,brand.ilike.%${term}%,style_code.ilike.%${term}%`
    );
  }

  const barcodeQuery =
    terms.length === 1 && q.length >= 3
      ? supabase
          .from("product_variants")
          .select("id, products(*, product_variants(*))")
          .ilike("barcode", `%${q}%`)
          .limit(MAX_RESULTS)
      : null;

  const [textResult, barcodeResult] = await Promise.all([
    textQuery.order("name", { ascending: true }).limit(MAX_RESULTS),
    barcodeQuery,
  ]);

  if (textResult.error) throw new Error(textResult.error.message);
  if (barcodeResult?.error) throw new Error(barcodeResult.error.message);

  const byProduct = new Map<string, PosSearchResult>();

  // A scanned/typed barcode is the most specific match, so list it first.
  for (const row of (barcodeResult?.data ?? []) as unknown as Array<{
    id: string;
    products: ProductRow | ProductRow[] | null;
  }>) {
    const productRow = Array.isArray(row.products) ? row.products[0] : row.products;
    if (!productRow || byProduct.has(productRow.id)) continue;
    byProduct.set(productRow.id, { product: toProduct(productRow), matchedVariantId: row.id });
  }

  for (const row of (textResult.data ?? []) as unknown as ProductRow[]) {
    if (byProduct.has(row.id)) continue;
    byProduct.set(row.id, { product: toProduct(row), matchedVariantId: null });
  }

  return [...byProduct.values()].slice(0, MAX_RESULTS);
}
