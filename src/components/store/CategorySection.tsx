"use client";

import Image from "next/image";
import Link from "next/link";
import {
  PRODUCT_CATEGORIES,
  shopCategoryPath,
  type StoreDepartment,
} from "@/lib/categories";

type CategorySectionProps = {
  department: StoreDepartment;
};

export function CategorySection({ department }: CategorySectionProps) {
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
        {PRODUCT_CATEGORIES.map((category) => (
          <Link
            key={category.id}
            href={shopCategoryPath(department, category.id)}
            className="group relative aspect-4/5 overflow-hidden rounded-2xl border border-slate-200 text-left transition hover:border-brand/40"
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
          </Link>
        ))}
      </div>
    </section>
  );
}
