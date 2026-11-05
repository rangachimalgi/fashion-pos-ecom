import type { CompleteProduct, ProductVariant } from "@/types/product";
import { STORE_RECEIPT } from "@/lib/storeReceipt";

export const STORE_TAG_BRAND = `${STORE_RECEIPT.name} ${STORE_RECEIPT.nameLine2}`;

export type HangTag = {
  id: string;
  barcode: string;
  code: string;
  name: string;
  detail: string;
  size: string;
  rateLabel: string;
};

export function formatTagRate(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const rounded = Math.round(amount);
  if (Math.abs(amount - rounded) < 0.005) return `${rounded}/-`;
  return `${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-`;
}

export function buildHangTag(product: CompleteProduct, variant: ProductVariant): HangTag {
  const code = (product.style_code || variant.barcode || "").trim().toUpperCase();
  const parts = [variant.color, product.category].filter(
    (value) => value && value.trim() && value.toLowerCase() !== "default"
  );

  return {
    id: variant.id,
    barcode: variant.barcode?.trim() || code,
    code,
    name: product.name.trim(),
    detail: parts.join(" ").toUpperCase(),
    size: String(variant.size || "").toUpperCase(),
    rateLabel: formatTagRate(product.base_price),
  };
}

export function hangTagsForProduct(product: CompleteProduct): HangTag[] {
  return product.variants
    .filter((variant) => variant.barcode || product.style_code)
    .map((variant) => buildHangTag(product, variant));
}
