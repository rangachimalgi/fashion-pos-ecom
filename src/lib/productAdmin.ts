import { supabase } from "@/lib/supabaseClient";
import type { CompleteProduct, ProductVariant } from "@/types/product";

export const LOW_STOCK_THRESHOLD = 5;

export type StockStatus = "out" | "low" | "in";

export function generateUniqueBarcode() {
  const prefix = "890";
  const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  return prefix + randomDigits;
}

export function mutationHint(message: string, code?: string) {
  const lower = message.toLowerCase();
  if (lower.includes("policy") || code === "42501") {
    return "\n\nRun supabase/migrations/004_admin_product_mutations.sql in the Supabase SQL Editor.";
  }
  if (
    lower.includes("category") ||
    lower.includes("department") ||
    lower.includes("image_urls") ||
    code === "PGRST204"
  ) {
    return "\n\nMissing DB columns. Run the latest files in supabase/migrations/ in the Supabase SQL Editor.";
  }
  return "";
}

export async function uploadProductImages(files: File[]): Promise<string[]> {
  const uploaded: string[] = [];

  for (const imageFile of files) {
    const fileExtension = imageFile.name.split(".").pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExtension}`;
    const filePath = `catalog/${fileName}`;

    const { error: storageError } = await supabase.storage
      .from("product-images")
      .upload(filePath, imageFile);

    if (storageError) throw storageError;

    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(filePath);
    uploaded.push(urlData.publicUrl);
  }

  return uploaded;
}

export function totalStock(product: Pick<CompleteProduct, "variants">): number {
  return product.variants.reduce((sum, variant) => sum + (variant.stock_quantity || 0), 0);
}

export function stockStatus(quantity: number): StockStatus {
  if (quantity <= 0) return "out";
  if (quantity <= LOW_STOCK_THRESHOLD) return "low";
  return "in";
}

export function variantSummary(variants: ProductVariant[]): string {
  if (!variants.length) return "No sizes";

  const sizes = [...new Set(variants.map((variant) => variant.size))];
  const colors = [...new Set(variants.map((variant) => variant.color).filter(Boolean))];
  const sizePart = sizes.join(" · ");
  const colorPart = colors.slice(0, 3).join(", ");
  const extra = colors.length > 3 ? ` +${colors.length - 3}` : "";

  return colorPart ? `${sizePart} · ${colorPart}${extra}` : sizePart;
}

