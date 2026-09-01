"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CompleteProduct } from "@/types/product";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "@/components/ui/carousel";
import { STORE_DEPARTMENTS } from "@/lib/categories";

type NewArrivalsSliderProps = {
  products: CompleteProduct[];
  loading: boolean;
  searchQuery: string;
  totalCount: number;
  category: string;
  /** When true (category browse), show a full product grid instead of the carousel */
  layout?: "carousel" | "grid";
  onClearSearch: () => void;
};

function productTypeLabel(product: CompleteProduct): string | null {
  const value = product.category?.trim();
  if (!value) return null;
  if ((STORE_DEPARTMENTS as readonly string[]).includes(value)) return null;
  return value;
}

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
  layout = "carousel",
  onClearSearch,
}: NewArrivalsSliderProps) {
  const router = useRouter();
  const sectionTitle = category;
  const showGrid = layout === "grid";

  const renderProductCard = (product: CompleteProduct) => {
    const typeLabel = productTypeLabel(product);

    return (
      <div key={product.id} className="group relative space-y-2">
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
        </div>

        <div
          className="space-y-0.5 px-0.5 cursor-pointer"
          onClick={() => router.push(`/product/${product.id}`)}
        >
          <p className="truncate text-sm font-extrabold tracking-tight text-slate-900 transition group-hover:text-brand">
            {product.brand}
          </p>
          {typeLabel ? (
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {typeLabel}
            </p>
          ) : null}
          <p className="pt-0.5 text-sm font-black text-slate-900">₹{product.base_price}</p>
        </div>
      </div>
    );
  };

  return (
    <section id="catalog" className="px-4 py-8 sm:px-6">
      {loading ? (
        <div className="space-y-6">
          <div className="flex items-end justify-between border-b border-slate-100 pb-4">
            <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">
              {sectionTitle}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="space-y-3 animate-pulse">
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
              : `Nothing tagged for ${category} yet. Add products from POS with this category selected.`}
          </p>
          {searchQuery ? (
            <Button variant="link" className="text-brand" onClick={onClearSearch}>
              Reset filters
            </Button>
          ) : null}
        </div>
      ) : showGrid ? (
        <div className="space-y-6">
          <div className="border-b border-slate-100 pb-4">
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 md:gap-6">
            {products.map((product) => renderProductCard(product))}
          </div>
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
                  {renderProductCard(product)}
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
