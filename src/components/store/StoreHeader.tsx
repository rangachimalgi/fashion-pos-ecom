"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { BagButton } from "@/components/cart/BagButton";
import { WishlistButton } from "@/components/store/WishlistButton";
import { ShopMenu } from "@/components/store/ShopMenu";
import { Input } from "@/components/ui/input";
import {
  STORE_DEPARTMENTS,
  shopCategoryPath,
  departmentToSlug,
  getDefaultCategory,
  type StoreDepartment,
} from "@/lib/categories";
import { categoriesForDepartment, useStoreCategories } from "@/lib/storeCategories";
import { cn } from "@/lib/utils";

const searchInputClass =
  "h-9 rounded-full border-2 border-slate-400 bg-white pr-3 text-xs shadow-sm transition-colors placeholder:text-slate-400 focus-visible:border-slate-700 focus-visible:ring-2 focus-visible:ring-slate-200 md:h-10 md:text-sm";

type StoreHeaderProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedDepartment: StoreDepartment;
};

function departmentHref(
  department: StoreDepartment,
  pathname: string,
  firstCategory: string
): string {
  const shopMatch = pathname.match(/^\/shop\/([^/]+)\/([^/]+)/);
  if (shopMatch) {
    const currentDeptSlug = shopMatch[1];

    // On a shop page, switch to this department's first category
    if (currentDeptSlug.toLowerCase() !== departmentToSlug(department)) {
      return shopCategoryPath(department, firstCategory);
    }
  }

  // Home (or same-department click on shop) → department landing
  return `/?department=${departmentToSlug(department)}`;
}

export function StoreHeader({
  searchQuery,
  onSearchChange,
  selectedDepartment,
}: StoreHeaderProps) {
  const pathname = usePathname() || "/";
  const categoryRows = useStoreCategories();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4 md:gap-4 md:px-6 md:py-5">
        <div className="flex min-w-0 items-center justify-start gap-2 sm:gap-3 md:gap-5">
          <ShopMenu selectedDepartment={selectedDepartment} />

          <nav className="flex min-w-0 items-center gap-2 overflow-x-auto sm:gap-3 md:gap-5">
            {STORE_DEPARTMENTS.map((department) => {
              const isActive = selectedDepartment === department;
              const href = departmentHref(
                department,
                pathname,
                categoriesForDepartment(department, categoryRows)[0]?.id ??
                  getDefaultCategory(department)
              );

              return (
                <Link
                  key={department}
                  href={href}
                  className={cn(
                    "shrink-0 border-b-2 pb-0.5 text-[9px] font-bold tracking-wider uppercase transition sm:text-[10px] md:text-xs",
                    isActive
                      ? "border-brand text-brand"
                      : "border-transparent text-slate-600 hover:text-brand"
                  )}
                >
                  {department}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex justify-center">
          <BrandLogo height={72} />
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-3">
          <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-52 md:max-w-64 lg:max-w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search styles..."
              className={`${searchInputClass} pl-9 md:pl-10`}
            />
          </div>

          <WishlistButton />

          <BagButton />
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 pb-3 sm:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-500" />
          <Input
            id="mobile-store-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search apparel, brands, colors..."
            className={`${searchInputClass} w-full pl-10`}
          />
        </div>
      </div>
    </header>
  );
}

/** Resolves active department from the URL when pages don't pass one. */
export function useHeaderDepartment(
  controlled?: StoreDepartment
): StoreDepartment {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();

  if (controlled) return controlled;

  const shopMatch = pathname.match(/^\/shop\/([^/]+)/);
  if (shopMatch) {
    const fromPath = STORE_DEPARTMENTS.find(
      (d) => d.toLowerCase() === shopMatch[1].toLowerCase()
    );
    if (fromPath) return fromPath;
  }

  const fromQuery = searchParams.get("department");
  if (fromQuery) {
    const match = STORE_DEPARTMENTS.find(
      (d) => d.toLowerCase() === fromQuery.toLowerCase()
    );
    if (match) return match;
  }

  return "Men";
}
