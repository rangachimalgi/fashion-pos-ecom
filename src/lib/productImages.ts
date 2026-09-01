import type { Product } from "@/types/product";

export const MAX_PRODUCT_IMAGES = 6;

export function getProductImages(
  product: Pick<Product, "image_url" | "image_urls">
): string[] {
  if (product.image_urls?.length) {
    return product.image_urls.filter(Boolean);
  }

  if (product.image_url) {
    return [product.image_url];
  }

  return [];
}

export function getProductPrimaryImage(
  product: Pick<Product, "image_url" | "image_urls">
): string | null {
  return getProductImages(product)[0] ?? null;
}
