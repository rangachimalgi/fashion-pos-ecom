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

export function formatTagRate(cost: number | null | undefined) {
  if (cost == null || !Number.isFinite(cost)) return "—";
  const rounded = Math.round(cost);
  if (Math.abs(cost - rounded) < 0.005) return `${rounded}/-`;
  return `${cost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-`;
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
    rateLabel: formatTagRate(product.cost_price),
  };
}

export function hangTagsForProduct(product: CompleteProduct): HangTag[] {
  return product.variants
    .filter((variant) => variant.barcode || product.style_code)
    .map((variant) => buildHangTag(product, variant));
}
