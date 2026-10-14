"use client";

import Image from "next/image";
import Link from "next/link";
import {
  getCategoriesForDepartment,
  shopCategoryPath,
  type StoreDepartment,
} from "@/lib/categories";

type CategorySectionProps = {
  department: StoreDepartment;
};

export function CategorySection({ department }: CategorySectionProps) {
  const categories = getCategoriesForDepartment(department);

  return (
    <section className="border-t border-slate-100 px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">
          Shop by category
        </h2>
        <p className="mt-1 text-xs font-medium text-slate-400">
          {department} picks — tap what you came for.
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={shopCategoryPath(department, category.id)}
            className="group text-center"
          >
            <div className="relative aspect-3/4 overflow-hidden bg-slate-100">
              <Image
                src={category.image}
                alt={category.label}
                fill
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 280px"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
            </div>
            <p className="mt-3 text-[11px] font-bold tracking-[0.18em] text-slate-900 uppercase sm:text-xs">
              {category.label}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
