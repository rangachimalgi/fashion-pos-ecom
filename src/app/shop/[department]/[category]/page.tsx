"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Filter, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { CompleteProduct, ProductVariant } from "@/types/product";
import { AppHeader } from "@/components/store/AppHeader";
import { ProductCard } from "@/components/store/ProductCard";
import {
  CatalogFilters,
  emptyCatalogFilters,
  type CatalogFilterState,
} from "@/components/store/CatalogFilters";
import {
  getCategoryMeta,
  parseCategorySlug,
  parseDepartmentSlug,
  productMatchesDepartment,
  productMatchesProductCategory,
  shopCategoryPath,
  type ProductCategory,
} from "@/lib/categories";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

type SortOption = "recommended" | "price-asc" | "price-desc" | "newest";

export default function ShopCategoryPage() {
  const params = useParams();
  const router = useRouter();

  const departmentSlug = String(params?.department ?? "");
  const categorySlug = String(params?.category ?? "");

  const department = parseDepartmentSlug(departmentSlug);
  const category = department
    ? parseCategorySlug(categorySlug, department)
    : null;

  const [products, setProducts] = useState<CompleteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [filters, setFilters] = useState<CatalogFilterState | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    if (!department || !category) return;

    async function fetchCatalog() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*, product_variants(*)");

        if (error) throw error;

        const formatted =
          (data?.map((item: Record<string, unknown>) => ({
            ...item,
            variants: (item.product_variants as ProductVariant[]) || [],
          })) as CompleteProduct[]) || [];

        setProducts(formatted);
      } catch (err) {
        console.error("Catalog fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCatalog();
  }, [department, category]);

  const categoryProducts = useMemo(() => {
    if (!department || !category) return [];
    return products.filter(
      (product) =>
        productMatchesDepartment(product, department) &&
        productMatchesProductCategory(product, category)
    );
  }, [products, department, category]);

  const priceBounds = useMemo(() => {
    if (!categoryProducts.length) return { min: 0, max: 5000 };
    const prices = categoryProducts.map((p) => p.base_price);
    const min = Math.floor(Math.min(...prices) / 50) * 50;
    const max = Math.ceil(Math.max(...prices) / 50) * 50;
    return { min, max: Math.max(max, min + 50) };
  }, [categoryProducts]);

  useEffect(() => {
    setFilters(emptyCatalogFilters(priceBounds));
  }, [priceBounds.min, priceBounds.max, category, department]);

  const availableBrands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of categoryProducts) {
      const brand = product.brand.trim();
      if (!brand) continue;
      counts.set(brand, (counts.get(brand) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryProducts]);

  const availableSizes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of categoryProducts) {
      for (const variant of product.variants) {
        if (variant.stock_quantity <= 0) continue;
        counts.set(variant.size, (counts.get(variant.size) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([size, count]) => ({ size, count }));
  }, [categoryProducts]);

  const filteredProducts = useMemo(() => {
    if (!filters) return categoryProducts;

    let list = categoryProducts.filter((product) => {
      if (product.base_price < filters.priceMin || product.base_price > filters.priceMax) {
        return false;
      }

      if (filters.brands.length > 0 && !filters.brands.includes(product.brand.trim())) {
        return false;
      }

      if (filters.sizes.length > 0) {
        const hasSize = product.variants.some(
          (v) => filters.sizes.includes(v.size) && v.stock_quantity > 0
        );
        if (!hasSize) return false;
      }

      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const matches =
          product.name.toLowerCase().includes(query) ||
          product.brand.toLowerCase().includes(query) ||
          product.variants.some((v) => v.color.toLowerCase().includes(query));
        if (!matches) return false;
      }

      return true;
    });

    switch (sortBy) {
      case "price-asc":
        list = [...list].sort((a, b) => a.base_price - b.base_price);
        break;
      case "price-desc":
        list = [...list].sort((a, b) => b.base_price - a.base_price);
        break;
      case "newest":
        list = [...list].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      default:
        break;
    }

    return list;
  }, [categoryProducts, filters, searchQuery, sortBy]);

  const handleCategoryChange = (next: ProductCategory) => {
    if (!department) return;
    setMobileFiltersOpen(false);
    router.push(shopCategoryPath(department, next));
  };

  if (!department || !category) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-900">
        <AppHeader />
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-bold text-rose-500">Category not found</p>
          <Link href="/" className="text-xs font-bold text-slate-500 underline">
            Back to storefront
          </Link>
        </div>
      </div>
    );
  }

  const categoryMeta = getCategoryMeta(category, department);
  const activeFilters = filters ?? emptyCatalogFilters(priceBounds);

  const filtersPanel = (
    <CatalogFilters
      department={department}
      availableBrands={availableBrands}
      availableSizes={availableSizes}
      priceBounds={priceBounds}
      filters={activeFilters}
      onChange={setFilters}
      activeCategory={category}
      onCategoryChange={handleCategoryChange}
    />
  );

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <AppHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedDepartment={department}
      />

      <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
        <nav className="text-[11px] font-medium tracking-wide text-slate-400">
          <Link href="/" className="hover:text-brand">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <span className="capitalize">{department}</span>
          <span className="mx-1.5">/</span>
          <span className="text-slate-700">{categoryMeta.label}</span>
        </nav>
        <h1 className="mt-1 text-lg font-black tracking-tight text-slate-900 sm:text-xl">
          {department} {categoryMeta.label}{" "}
          <span className="font-mono text-sm font-normal text-slate-400">
            – {filteredProducts.length} item{filteredProducts.length === 1 ? "" : "s"}
          </span>
        </h1>
      </div>

      <div className="flex min-h-[70vh]">
        <div className="hidden md:block">{filtersPanel}</div>

        <div className="min-w-0 flex-1 px-4 py-4 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-slate-200 text-xs font-bold uppercase tracking-wider md:hidden"
                  />
                }
              >
                <Filter className="size-3.5" />
                Filters
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(100%,20rem)] gap-0 overflow-y-auto border-slate-100 p-0">
                {filtersPanel}
              </SheetContent>
            </Sheet>

            <div className="ml-auto flex items-center gap-2">
              <SlidersHorizontal className="hidden size-3.5 text-slate-400 sm:block" />
              <label className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                <span className="hidden sm:inline">Sort by</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-slate-400"
                >
                  <option value="recommended">Recommended</option>
                  <option value="newest">{"What's New"}</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                </select>
              </label>
            </div>
          </div>

          {loading || !filters ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="animate-pulse space-y-3">
                  <div className="aspect-3/4 w-full rounded-xl bg-slate-100" />
                  <div className="h-3 w-1/3 rounded bg-slate-100" />
                  <div className="h-4 w-3/4 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-20 text-center">
              <p className="text-sm font-bold text-slate-500">No products match these filters</p>
              <p className="mx-auto max-w-xs text-xs text-slate-400">
                Try clearing brand, size, or price filters — or browse another category.
              </p>
              <Button
                variant="link"
                className="text-brand"
                onClick={() => setFilters(emptyCatalogFilters(priceBounds))}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
