"use client";

import { Search } from "lucide-react";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type CatalogFilterState = {
  brands: string[];
  sizes: string[];
  priceMin: number;
  priceMax: number;
  brandSearch: string;
};

type CatalogFiltersProps = {
  availableBrands: { name: string; count: number }[];
  availableSizes: { size: string; count: number }[];
  priceBounds: { min: number; max: number };
  filters: CatalogFilterState;
  onChange: (next: CatalogFilterState) => void;
  activeCategory: ProductCategory;
  onCategoryChange: (category: ProductCategory) => void;
};

const SIZE_ORDER = ["S", "M", "L", "XL", "XXL"] as const;

export function emptyCatalogFilters(
  priceBounds: { min: number; max: number }
): CatalogFilterState {
  return {
    brands: [],
    sizes: [],
    priceMin: priceBounds.min,
    priceMax: priceBounds.max,
    brandSearch: "",
  };
}

export function CatalogFilters({
  availableBrands,
  availableSizes,
  priceBounds,
  filters,
  onChange,
  activeCategory,
  onCategoryChange,
}: CatalogFiltersProps) {
  const filteredBrands = availableBrands.filter((b) =>
    b.name.toLowerCase().includes(filters.brandSearch.trim().toLowerCase())
  );

  const toggleBrand = (brand: string) => {
    const brands = filters.brands.includes(brand)
      ? filters.brands.filter((b) => b !== brand)
      : [...filters.brands, brand];
    onChange({ ...filters, brands });
  };

  const toggleSize = (size: string) => {
    const sizes = filters.sizes.includes(size)
      ? filters.sizes.filter((s) => s !== size)
      : [...filters.sizes, size];
    onChange({ ...filters, sizes });
  };

  const clearAll = () => {
    onChange(emptyCatalogFilters(priceBounds));
  };

  const hasActiveFilters =
    filters.brands.length > 0 ||
    filters.sizes.length > 0 ||
    filters.priceMin > priceBounds.min ||
    filters.priceMax < priceBounds.max;

  const sortedSizes = [...availableSizes].sort(
    (a, b) =>
      SIZE_ORDER.indexOf(a.size as (typeof SIZE_ORDER)[number]) -
      SIZE_ORDER.indexOf(b.size as (typeof SIZE_ORDER)[number])
  );

  return (
    <aside className="w-full shrink-0 border-slate-100 bg-white md:w-56 md:border-r lg:w-64">
      <div className="md:sticky md:top-[4.5rem] md:max-h-[calc(100vh-4.5rem)] md:overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-xs font-black tracking-[0.15em] text-slate-900 uppercase">
            Filters
          </h2>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] font-bold tracking-wider text-brand uppercase hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>

        <section className="border-b border-slate-100 px-4 py-4">
          <h3 className="mb-3 text-[10px] font-black tracking-[0.15em] text-slate-900 uppercase">
            Categories
          </h3>
          <ul className="space-y-2">
            {PRODUCT_CATEGORIES.map((category) => {
              const isActive = activeCategory === category.id;
              return (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() => onCategoryChange(category.id)}
                    className={cn(
                      "flex w-full items-center gap-2 text-left text-xs transition",
                      isActive
                        ? "font-bold text-brand"
                        : "font-medium text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-3.5 items-center justify-center rounded-sm border",
                        isActive
                          ? "border-brand bg-brand text-white"
                          : "border-slate-300 bg-white"
                      )}
                    >
                      {isActive ? (
                        <span className="text-[8px] leading-none">✓</span>
                      ) : null}
                    </span>
                    {category.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="border-b border-slate-100 px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-black tracking-[0.15em] text-slate-900 uppercase">
              Brand
            </h3>
          </div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              value={filters.brandSearch}
              onChange={(e) => onChange({ ...filters, brandSearch: e.target.value })}
              placeholder="Search brand"
              className="h-8 rounded-md border-slate-200 pl-8 text-xs"
            />
          </div>
          <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {filteredBrands.length === 0 ? (
              <li className="text-[11px] text-slate-400">No brands found</li>
            ) : (
              filteredBrands.map((brand) => {
                const checked = filters.brands.includes(brand.name);
                return (
                  <li key={brand.name}>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 hover:text-slate-900">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBrand(brand.name)}
                        className="size-3.5 rounded border-slate-300 accent-brand"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{brand.name}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        ({brand.count})
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="border-b border-slate-100 px-4 py-4">
          <h3 className="mb-3 text-[10px] font-black tracking-[0.15em] text-slate-900 uppercase">
            Price
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-600">
              <span>₹{filters.priceMin}</span>
              <span className="font-normal text-slate-400">—</span>
              <span>₹{filters.priceMax}</span>
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-medium tracking-wide text-slate-400 uppercase">
                Min
              </label>
              <input
                type="range"
                min={priceBounds.min}
                max={priceBounds.max}
                step={50}
                value={filters.priceMin}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  onChange({
                    ...filters,
                    priceMin: Math.min(next, filters.priceMax),
                  });
                }}
                className="w-full accent-brand"
              />
              <label className="block text-[10px] font-medium tracking-wide text-slate-400 uppercase">
                Max
              </label>
              <input
                type="range"
                min={priceBounds.min}
                max={priceBounds.max}
                step={50}
                value={filters.priceMax}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  onChange({
                    ...filters,
                    priceMax: Math.max(next, filters.priceMin),
                  });
                }}
                className="w-full accent-brand"
              />
            </div>
            <p className="text-[10px] text-slate-400">
              Range ₹{priceBounds.min} – ₹{priceBounds.max}
            </p>
          </div>
        </section>

        <section className="px-4 py-4">
          <h3 className="mb-3 text-[10px] font-black tracking-[0.15em] text-slate-900 uppercase">
            Size
          </h3>
          <ul className="space-y-2">
            {sortedSizes.map((item) => {
              const checked = filters.sizes.includes(item.size);
              return (
                <li key={item.size}>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSize(item.size)}
                      className="size-3.5 rounded border-slate-300 accent-brand"
                    />
                    <span className="font-medium">{item.size}</span>
                    <span className="ml-auto text-[10px] text-slate-400">({item.count})</span>
                  </label>
                </li>
              );
            })}
            {sortedSizes.length === 0 ? (
              <li className="text-[11px] text-slate-400">No sizes available</li>
            ) : null}
          </ul>
        </section>
      </div>
    </aside>
  );
}
