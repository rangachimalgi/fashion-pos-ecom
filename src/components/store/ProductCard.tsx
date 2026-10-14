"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import type { Product } from "@/types/product";
import { STORE_DEPARTMENTS } from "@/lib/categories";
import { getProductPrimaryImage } from "@/lib/productImages";
import { useWishlistStore } from "@/store/useWishlistStore";

type ProductCardProps = {
  product: Product;
};

function productTypeLabel(product: Product): string | null {
  const value = product.category?.trim();
  if (!value) return null;
  if ((STORE_DEPARTMENTS as readonly string[]).includes(value)) return null;
  return value;
}

export function ProductCard({ product }: ProductCardProps) {
  const router = useRouter();
  const items = useWishlistStore((state) => state.items);
  const toggle = useWishlistStore((state) => state.toggle);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const saved = ready && items.some((item) => item.id === product.id);
  const typeLabel = productTypeLabel(product);
  const image = getProductPrimaryImage(product);

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
        <button
          type="button"
          aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={saved}
          onClick={(event) => {
            event.stopPropagation();
            toggle(product);
          }}
          className="absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur-sm transition hover:text-rose-500"
        >
          <Heart className={`size-4 stroke-[1.75] ${saved ? "fill-rose-500 stroke-rose-500" : ""}`} />
        </button>
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
        <p className="pt-0.5 text-sm font-black text-slate-900">₹{product.base_price}</p>
      </div>
    </div>
  );
}
