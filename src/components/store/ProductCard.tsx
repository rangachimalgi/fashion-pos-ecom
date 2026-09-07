"use client";

import { useRouter } from "next/navigation";
import type { CompleteProduct } from "@/types/product";
import { STORE_DEPARTMENTS } from "@/lib/categories";
import { getProductPrimaryImage } from "@/lib/productImages";

type ProductCardProps = {
  product: CompleteProduct;
};

function productTypeLabel(product: CompleteProduct): string | null {
  const value = product.category?.trim();
  if (!value) return null;
  if ((STORE_DEPARTMENTS as readonly string[]).includes(value)) return null;
  return value;
}

export function ProductCard({ product }: ProductCardProps) {
  const router = useRouter();
  const typeLabel = productTypeLabel(product);
  const image = getProductPrimaryImage(product);
  const mrp = Math.round(product.base_price * 1.4);
  const discount = Math.round(((mrp - product.base_price) / mrp) * 100);

  const goToProduct = () => router.push(`/product/${product.id}`);

  return (
    <div className="group relative space-y-2">
      <div
        role="link"
        tabIndex={0}
        onClick={goToProduct}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") goToProduct();
        }}
        className="relative aspect-3/4 cursor-pointer overflow-hidden rounded-xl border border-slate-100 bg-slate-50 shadow-sm transition duration-300 group-hover:shadow-md"
      >
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-100 p-6 text-center text-xs font-bold text-slate-300">
            No Imagery Available
          </div>
        )}
      </div>

      <div className="cursor-pointer space-y-0.5 px-0.5" onClick={goToProduct}>
        <p className="truncate text-sm font-extrabold tracking-tight text-slate-900 transition group-hover:text-brand">
          {product.brand}
        </p>
        <p className="truncate text-xs font-medium text-slate-500">{product.name}</p>
        {typeLabel ? (
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {typeLabel}
          </p>
        ) : null}
        <div className="flex flex-wrap items-baseline gap-1.5 pt-0.5">
          <p className="text-sm font-black text-slate-900">₹{product.base_price}</p>
          <p className="text-xs text-slate-400 line-through">₹{mrp}</p>
          <p className="text-xs font-bold text-rose-500">({discount}% OFF)</p>
        </div>
      </div>
    </div>
  );
}
