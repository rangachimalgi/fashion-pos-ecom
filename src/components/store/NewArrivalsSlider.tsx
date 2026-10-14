"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CompleteProduct } from "@/types/product";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "@/components/ui/carousel";
import { ProductCard } from "@/components/store/ProductCard";

type NewArrivalsSliderProps = {
  products: CompleteProduct[];
  loading: boolean;
  searchQuery: string;
  totalCount: number;
  category: string;
  layout?: "carousel" | "grid";
  onClearSearch: () => void;
};

function SliderArrows() {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();

  return (
    <>
      <button
        type="button"
        aria-label="Previous"
        disabled={!canScrollPrev}
        onClick={scrollPrev}
        className="absolute top-[32%] left-1 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-md transition hover:bg-white disabled:pointer-events-none disabled:opacity-0 sm:left-2 sm:size-10"
      >
        <ChevronLeft className="size-5 stroke-2" />
      </button>
      <button
        type="button"
        aria-label="Next"
        disabled={!canScrollNext}
        onClick={scrollNext}
        className="absolute top-[32%] right-1 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-md transition hover:bg-white disabled:pointer-events-none disabled:opacity-0 sm:right-2 sm:size-10"
      >
        <ChevronRight className="size-5 stroke-2" />
      </button>
    </>
  );
}

function SectionHeading({
  title,
  count,
  searchQuery,
  totalCount,
  onClearSearch,
}: {
  title: string;
  count?: number;
  searchQuery: string;
  totalCount: number;
  onClearSearch: () => void;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-black tracking-wider text-slate-900 uppercase">
        {title}
        {count != null ? (
          <span className="ml-2 font-mono text-sm font-normal text-slate-400">
            ({count}
            {searchQuery ? ` of ${totalCount}` : ""})
          </span>
        ) : null}
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
  const sectionTitle = category;
  const showGrid = layout === "grid";

  return (
    <section id="catalog" className="px-6 py-8 sm:px-8">
      {loading ? (
        <div>
          <SectionHeading
            title={sectionTitle}
            searchQuery={searchQuery}
            totalCount={totalCount}
            onClearSearch={onClearSearch}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="animate-pulse space-y-2">
                <div className="aspect-3/4 w-full bg-slate-100" />
                <div className="h-3 w-3/4 rounded bg-slate-100" />
                <div className="h-3 w-1/3 rounded bg-slate-100" />
                <div className="h-4 w-1/4 rounded bg-slate-100" />
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
        <div>
          <SectionHeading
            title={sectionTitle}
            count={products.length}
            searchQuery={searchQuery}
            totalCount={totalCount}
            onClearSearch={onClearSearch}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      ) : (
        <Carousel
          opts={{
            align: "start",
            loop: products.length > 5,
            dragFree: false,
          }}
          className="w-full"
        >
          <SectionHeading
            title={sectionTitle}
            count={products.length}
            searchQuery={searchQuery}
            totalCount={totalCount}
            onClearSearch={onClearSearch}
          />

          <div className="relative">
            <CarouselContent className="-ml-3">
              {products.map((product) => (
                <CarouselItem
                  key={product.id}
                  className="basis-[58%] pl-3 sm:basis-[38%] md:basis-1/4 lg:basis-1/5"
                >
                  <ProductCard product={product} />
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
