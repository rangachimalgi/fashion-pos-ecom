"use client";

import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import type { CompleteProduct, ProductVariant } from "@/types/product";
import { ProductCard } from "@/components/store/ProductCard";
import { useCartStore } from "@/store/useCartStore";
import { useWishlistStore } from "@/store/useWishlistStore";
import { getProductPrimaryImage } from "@/lib/productImages";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SIZE_ORDER = ["S", "M", "L", "XL", "XXL"] as const;

type WishlistItemProps = {
  product: CompleteProduct;
};

export function WishlistItem({ product }: WishlistItemProps) {
  const addItemToCart = useCartStore((state) => state.addItemToCart);
  const removeFromWishlist = useWishlistStore((state) => state.remove);
  const [open, setOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  const image = getProductPrimaryImage(product);
  const inStock = product.variants.some((v) => v.stock_quantity > 0);
  const colors = useMemo(
    () => [...new Set(product.variants.map((v) => v.color.trim()).filter(Boolean))],
    [product.variants]
  );

  const sizesForColor = useMemo(() => {
    const pool = selectedColor
      ? product.variants.filter(
          (v) => v.color.trim().toLowerCase() === selectedColor.trim().toLowerCase()
        )
      : product.variants;

    return [...pool].sort(
      (a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size)
    );
  }, [product.variants, selectedColor]);

  const openPicker = () => {
    if (!inStock) return;
    const onlyColor = colors.length === 1 ? colors[0] : null;
    setSelectedColor(onlyColor);
    setSelectedVariant(null);
    setOpen(true);
  };

  const selectColor = (color: string) => {
    setSelectedColor(color);
    setSelectedVariant(null);
  };

  const moveToBag = () => {
    if (!selectedVariant) return;
    addItemToCart(product, selectedVariant);
    removeFromWishlist(product.id);
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <ProductCard product={product} />

      <button
        type="button"
        disabled={!inStock}
        onClick={openPicker}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-rose-500 text-[11px] font-extrabold tracking-wider text-white uppercase transition hover:bg-rose-600 disabled:bg-slate-100 disabled:text-slate-400"
      >
        <ShoppingBag className="size-3.5 stroke-[2.5]" />
        Add to bag
      </button>
      {!inStock ? (
        <p className="text-center text-[10px] font-medium text-slate-400">Out of stock</p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-md gap-0 bg-white p-5 sm:max-w-md"
          showCloseButton
        >
          <DialogHeader className="pr-8">
            <div className="flex gap-3">
              <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                {image ? (
                  <img src={image} alt={product.name} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="font-bold text-slate-900">
                  {product.brand}: {product.name}
                </DialogTitle>
                {product.category ? (
                  <DialogDescription className="text-sm text-slate-500">
                    {product.category}
                  </DialogDescription>
                ) : (
                  <DialogDescription className="sr-only">Choose a size to move this to your bag</DialogDescription>
                )}
                <p className="text-base font-black text-slate-900">₹{product.base_price}</p>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-6 space-y-3">
            {colors.length > 1 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800">Please select a color.</p>
                <div className="flex flex-wrap gap-2">
                  {colors.map((color) => {
                    const hasStock = product.variants.some(
                      (v) =>
                        v.color.trim().toLowerCase() === color.trim().toLowerCase() &&
                        v.stock_quantity > 0
                    );
                    const isSelected =
                      selectedColor?.trim().toLowerCase() === color.trim().toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        disabled={!hasStock}
                        onClick={() => selectColor(color)}
                        className={cn(
                          "h-10 rounded-lg border px-3 text-xs font-semibold",
                          isSelected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : hasStock
                              ? "border-slate-300 bg-white text-slate-800"
                              : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 line-through"
                        )}
                      >
                        {color}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {colors.length > 1 && !selectedColor ? (
              <p className="text-sm text-slate-400">Choose a color to see sizes.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800">Please select a size.</p>
                <div className="flex flex-wrap gap-2">
                  {sizesForColor.map((variant) => {
                    const hasStock = variant.stock_quantity > 0;
                    const isSelected = selectedVariant?.id === variant.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        disabled={!hasStock}
                        onClick={() => setSelectedVariant(variant)}
                        className={cn(
                          "flex h-10 min-w-12 items-center justify-center rounded-lg border px-3 text-xs font-semibold",
                          isSelected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : hasStock
                              ? "border-slate-300 bg-white text-slate-800"
                              : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 line-through"
                        )}
                      >
                        {variant.size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!selectedVariant}
            onClick={moveToBag}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-slate-900 text-sm font-bold tracking-wider text-white uppercase disabled:bg-slate-300 disabled:text-white"
          >
            Add to bag
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
