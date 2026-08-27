"use client";

import Image from "next/image";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/categories";
import { cn } from "@/lib/utils";

type CategorySectionProps = {
  selected: ProductCategory | null;
  onSelect: (category: ProductCategory) => void;
};

export function CategorySection({ selected, onSelect }: CategorySectionProps) {
  return (
    <section className="border-t border-slate-100 px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">
          Shop by category
        </h2>
        <p className="mt-1 text-xs font-medium text-slate-400">
          Tshirts, shirts, and the rest — tap what you came for.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {PRODUCT_CATEGORIES.map((category) => {
          const isActive = selected === category.id;

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.id)}
              className={cn(
                "group relative aspect-4/5 overflow-hidden rounded-2xl border text-left transition",
                isActive
                  ? "border-brand ring-2 ring-brand/40"
                  : "border-slate-200 hover:border-brand/40"
              )}
            >
              <Image
                src={category.image}
                alt={category.label}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-lg font-black tracking-tight text-white uppercase drop-shadow-sm">
                  {category.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
