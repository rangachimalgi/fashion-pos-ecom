"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CompleteProduct, ProductVariant } from "@/types/product";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "@/components/ui/carousel";

type NewArrivalsSliderProps = {
  products: CompleteProduct[];
  loading: boolean;
  searchQuery: string;
  totalCount: number;
  category: string;
  addedVariantId: string | null;
  onClearSearch: () => void;
  onAddToCart: (product: CompleteProduct, variant: ProductVariant) => void;
};

function SliderArrows() {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
      {/* Matches one product image height so arrows sit mid-card */}
      <div
        aria-hidden
        className="aspect-3/4 w-[calc(78%-0.5rem)] sm:w-[calc(50%-0.5rem)] md:w-[calc(33.333%-0.5rem)] lg:w-[calc(25%-0.5rem)]"
      />
      <div className="absolute inset-0 flex items-center justify-between px-1 sm:px-2">
        <button
          type="button"
          aria-label="Previous slide"
          disabled={!canScrollPrev}
          onClick={scrollPrev}
          className="pointer-events-auto text-black drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)] transition hover:opacity-70 disabled:opacity-30"
        >
          <ChevronLeft className="size-12 stroke-[2.75] sm:size-16" />
        </button>
        <button
          type="button"
          aria-label="Next slide"
          disabled={!canScrollNext}
          onClick={scrollNext}
          className="pointer-events-auto text-black drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)] transition hover:opacity-70 disabled:opacity-30"
        >
          <ChevronRight className="size-12 stroke-[2.75] sm:size-16" />
        </button>
      </div>
    </div>
  );
}

export function NewArrivalsSlider({
  products,
  loading,
  searchQuery,
  totalCount,
  category,
  addedVariantId,
  onClearSearch,
  onAddToCart,
}: NewArrivalsSliderProps) {
  const router = useRouter();
  const sectionTitle = `${category} · New Arrivals`;

  return (
    <section id="catalog" className="px-4 py-8 sm:px-6">
      {loading ? (
        <div className="space-y-6">
          <div className="flex items-end justify-between border-b border-slate-100 pb-4">
            <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">
              {sectionTitle}
            </h2>
          </div>
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="min-w-0 basis-1/2 space-y-3 animate-pulse sm:basis-1/3 md:basis-1/4">
                <div className="aspect-3/4 w-full rounded-xl bg-slate-100" />
                <div className="h-3 w-1/3 rounded bg-slate-100" />
                <div className="h-4 w-3/4 rounded bg-slate-100" />
                <div className="h-3 w-1/4 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ) : products.length === 0 ? (
        <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-20 text-center">
          <p className="text-sm font-bold text-slate-500">
            {searchQuery
              ? "[ NO MATCHES FOR YOUR SEARCH ]"
              : `[ NO ${category.toUpperCase()} PRODUCTS YET ]`}
          </p>
          <p className="mx-auto max-w-xs text-xs text-slate-400">
            {searchQuery
              ? "Try a different brand, style, or color keyword."
              : `Nothing tagged for ${category} yet. Switch category or add products from POS.`}
          </p>
          {searchQuery ? (
            <Button variant="link" className="text-brand" onClick={onClearSearch}>
              Reset filters
            </Button>
          ) : null}
        </div>
      ) : (
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full"
        >
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">
              {sectionTitle}{" "}
              <span className="font-mono text-sm font-normal text-slate-400">
                ({products.length}
                {searchQuery ? ` of ${totalCount}` : ""})
              </span>
            </h2>
            {searchQuery ? (
              <Button
                variant="link"
                className="h-auto px-0 text-xs font-bold text-slate-500 hover:text-brand"
                onClick={onClearSearch}
              >
                Clear search
              </Button>
            ) : null}
          </div>

          <div className="relative">
            <CarouselContent className="-ml-2">
              {products.map((product) => (
                <CarouselItem
                  key={product.id}
                  className="basis-[78%] pl-2 sm:basis-1/2 md:basis-1/3 lg:basis-1/4"
                >
                  <div className="group relative space-y-3">
                    <div
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/product/${product.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          router.push(`/product/${product.id}`);
                        }
                      }}
                      className="relative aspect-3/4 cursor-pointer overflow-hidden rounded-xl border border-slate-100 bg-slate-50 shadow-sm transition duration-300 group-hover:shadow-md"
                    >
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-100 p-6 text-center text-xs font-bold text-slate-300">
                          No Imagery Available
                        </div>
                      )}
                      <span className="absolute top-3 left-3 rounded bg-white px-2 py-0.5 text-[9px] font-black tracking-wider text-slate-900 uppercase shadow-sm">
                        {product.brand}
                      </span>
                    </div>

                    <div className="space-y-1 px-1">
                      <h3
                        onClick={() => router.push(`/product/${product.id}`)}
                        className="cursor-pointer truncate text-sm font-extrabold tracking-tight text-slate-900 transition group-hover:text-brand"
                      >
                        {product.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">₹{product.base_price}</span>
                        <span className="text-[10px] text-slate-400 line-through">
                          ₹{Math.round(product.base_price * 1.4)}
                        </span>
                        <span className="text-[10px] font-extrabold text-brand">(40% OFF)</span>
                      </div>

                      <p className="pt-0.5 text-[10px] font-medium text-slate-400">
                        Tap a size to add to bag
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {product.variants.map((variant) => {
                          const inStock = variant.stock_quantity > 0;
                          const justAdded = addedVariantId === variant.id;

                          return (
                            <Button
                              key={variant.id}
                              type="button"
                              variant="outline"
                              size="xs"
                              disabled={!inStock}
                              onClick={() => onAddToCart(product, variant)}
                              title={inStock ? `${variant.size} · ${variant.color}` : "Out of stock"}
                              className={`h-auto min-w-0 rounded border px-1.5 py-0.5 text-[9px] font-black ${
                                justAdded
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                                  : inStock
                                    ? "border-slate-200 bg-white text-slate-700 hover:border-brand hover:text-brand"
                                    : "border-slate-100 bg-slate-50 text-slate-300 line-through"
                              }`}
                            >
                              {justAdded ? <Check className="size-2.5" /> : null}
                              {variant.size}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>

            <SliderArrows />
          </div>
        </Carousel>
      )}
    </section>
  );
}
