"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getCategoriesForDepartment,
  shopCategoryPath,
  type StoreDepartment,
} from "@/lib/categories";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "@/components/ui/carousel";

type ExploreBannerSliderProps = {
  department: StoreDepartment;
};

function BannerArrows() {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();

  return (
    <>
      <button
        type="button"
        aria-label="Previous banner"
        disabled={!canScrollPrev}
        onClick={(e) => {
          e.stopPropagation();
          scrollPrev();
        }}
        className="absolute top-1/2 left-3 z-20 -translate-y-1/2 text-slate-900 transition hover:opacity-70 disabled:opacity-30 sm:left-5"
      >
        <ChevronLeft className="size-10 stroke-[2.5] sm:size-12" />
      </button>
      <button
        type="button"
        aria-label="Next banner"
        disabled={!canScrollNext}
        onClick={(e) => {
          e.stopPropagation();
          scrollNext();
        }}
        className="absolute top-1/2 right-3 z-20 -translate-y-1/2 text-slate-900 transition hover:opacity-70 disabled:opacity-30 sm:right-5"
      >
        <ChevronRight className="size-10 stroke-[2.5] sm:size-12" />
      </button>
    </>
  );
}

export function ExploreBannerSlider({ department }: ExploreBannerSliderProps) {
  const router = useRouter();
  const categories = getCategoriesForDepartment(department);

  return (
    <section className="px-4 pt-5 sm:px-6 sm:pt-6">
      <Carousel
        key={department}
        opts={{
          align: "start",
          loop: true,
        }}
        className="w-full"
      >
        <div className="relative overflow-hidden rounded-2xl">
          <CarouselContent className="ml-0">
            {categories.map((category, index) => (
              <CarouselItem key={`${department}-${category.id}`} className="basis-full pl-0">
                <button
                  type="button"
                  onClick={() => router.push(shopCategoryPath(department, category.id))}
                  className="relative grid min-h-72 w-full overflow-hidden text-left md:min-h-96 md:grid-cols-2"
                  style={{ backgroundColor: category.accentSoft }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-80"
                    style={{
                      background: `linear-gradient(115deg, ${category.accentSoft} 0%, ${category.accentSoft} 42%, ${category.accent}33 100%)`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute -top-16 -left-10 size-56 rounded-full blur-3xl"
                    style={{ backgroundColor: `${category.accent}33` }}
                  />

                  <div className="relative z-10 flex flex-col justify-center gap-3 px-6 py-10 sm:px-10 md:px-12">
                    <span
                      className="w-fit rounded-full px-2.5 py-1 text-[10px] font-black tracking-[0.18em] uppercase"
                      style={{
                        color: category.accent,
                        backgroundColor: `${category.accent}18`,
                      }}
                    >
                      {department} · New drop
                    </span>
                    <h2 className="max-w-md text-3xl font-black tracking-tight text-slate-900 uppercase sm:text-4xl md:text-5xl">
                      Explore {category.label}
                    </h2>
                    <p className="max-w-sm text-sm font-medium text-slate-600">
                      {category.tagline}
                    </p>
                  </div>

                  <div className="relative min-h-56 md:min-h-full">
                    <Image
                      src={category.image}
                      alt={`${department} ${category.label}`}
                      fill
                      priority={index === 0}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover"
                    />
                    <div
                      className="absolute inset-0 md:hidden"
                      style={{
                        background: `linear-gradient(to top, ${category.accentSoft} 0%, transparent 45%)`,
                      }}
                    />
                  </div>
                </button>
              </CarouselItem>
            ))}
          </CarouselContent>

          <BannerArrows />
        </div>
      </Carousel>
    </section>
  );
}
