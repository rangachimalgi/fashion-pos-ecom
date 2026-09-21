"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ListFilter, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { CompleteProduct, ProductVariant } from "@/types/product";
import {
  STORE_DEPARTMENTS,
  getCategoriesForDepartment,
  type StoreDepartment,
} from "@/lib/categories";
import { getProductPrimaryImage } from "@/lib/productImages";
import {
  mutationHint,
  stockStatus,
  totalStock,
  variantSummary,
} from "@/lib/productAdmin";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function stockLabel(status: ReturnType<typeof stockStatus>) {
  if (status === "out") return "Out of stock";
  if (status === "low") return "Low stock";
  return "In stock";
}

export default function AdminPanelPage() {
  const [products, setProducts] = useState<CompleteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<StoreDepartment | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<CompleteProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryOptions =
    departmentFilter === "all"
      ? STORE_DEPARTMENTS.flatMap((department) => getCategoriesForDepartment(department))
      : getCategoriesForDepartment(departmentFilter);

  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    return categoryOptions.filter((category) => {
      if (seen.has(category.id)) return false;
      seen.add(category.id);
      return true;
    });
  }, [categoryOptions]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("products")
        .select("*, product_variants(*)")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const formatted =
        (data?.map((item: Record<string, unknown>) => ({
          ...item,
          variants: (item.product_variants as ProductVariant[]) || [],
        })) as CompleteProduct[]) || [];

      setProducts(formatted);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return products.filter((product) => {
      if (departmentFilter !== "all" && product.department !== departmentFilter) {
        return false;
      }

      if (categoryFilter !== "all" && product.category !== categoryFilter) {
        return false;
      }

      if (!query) return true;

      return (
        product.name.toLowerCase().includes(query) ||
        product.brand.toLowerCase().includes(query) ||
        product.category?.toLowerCase().includes(query) ||
        product.department?.toLowerCase().includes(query)
      );
    });
  }, [products, searchQuery, departmentFilter, categoryFilter]);

  const activeFilterCount =
    (departmentFilter === "all" ? 0 : 1) + (categoryFilter === "all" ? 0 : 1);

  const handleDelete = async () => {
    if (!productToDelete) return;

    setDeletingId(productToDelete.id);
    setError(null);

    try {
      const { error: variantError } = await supabase
        .from("product_variants")
        .delete()
        .eq("product_id", productToDelete.id);

      if (variantError) throw variantError;

      const { error: productError } = await supabase
        .from("products")
        .delete()
        .eq("id", productToDelete.id);

      if (productError) {
        throw new Error(productError.message + mutationHint(productError.message, productError.code));
      }

      setProducts((current) => current.filter((p) => p.id !== productToDelete.id));
      setProductToDelete(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <main className="space-y-4 px-4 py-6 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-medium text-foreground">
            {loading ? "…" : filteredProducts.length} products
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {showSearch ? (
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products…"
                  className="h-8 bg-white pl-8 pr-8"
                />
                <button
                  type="button"
                  aria-label="Close search"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setShowSearch(false);
                    setSearchQuery("");
                  }}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={() => setShowSearch(true)}
                aria-label="Search"
              >
                <Search className="size-3.5" />
              </Button>
            )}

            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 bg-white"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((open) => !open)}
              >
                <ListFilter className="size-3.5" />
                Filter
                {activeFilterCount > 0 ? (
                  <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </Button>

              {filterOpen ? (
                <div className="absolute top-[calc(100%+0.5rem)] right-0 z-20 w-64 rounded-xl border border-border bg-white p-3 shadow-md">
                  <p className="mb-2 text-sm font-medium">Filter products</p>
                  <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Department
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDepartmentFilter("all");
                        setCategoryFilter("all");
                      }}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                        departmentFilter === "all"
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-white text-muted-foreground hover:text-foreground"
                      )}
                    >
                      All
                    </button>
                    {STORE_DEPARTMENTS.map((department) => (
                      <button
                        key={department}
                        type="button"
                        onClick={() => {
                          setDepartmentFilter(department);
                          setCategoryFilter("all");
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                          departmentFilter === department
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-white text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {department}
                      </button>
                    ))}
                  </div>

                  <p className="mt-3 mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Category
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCategoryFilter("all")}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                        categoryFilter === "all"
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-white text-muted-foreground hover:text-foreground"
                      )}
                    >
                      All
                    </button>
                    {uniqueCategories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => setCategoryFilter(category.id)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                          categoryFilter === category.id
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-white text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>

                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      className="mt-3 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setDepartmentFilter("all");
                        setCategoryFilter("all");
                        setFilterOpen(false);
                      }}
                    >
                      Clear filters
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <Link
              href="/admin/products/new"
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
            >
              <Plus className="size-3.5" />
              New product
            </Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableHead className="h-11 pl-4 text-xs text-muted-foreground">Product</TableHead>
                <TableHead className="h-11 text-xs text-muted-foreground">Brand</TableHead>
                <TableHead className="h-11 text-xs text-muted-foreground">Price</TableHead>
                <TableHead className="h-11 text-xs text-muted-foreground">Stock</TableHead>
                <TableHead className="h-11 text-xs text-muted-foreground">Department</TableHead>
                <TableHead className="h-11 text-xs text-muted-foreground">Category</TableHead>
                <TableHead className="h-11 pr-4 text-right text-xs text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell className="pl-4" colSpan={7}>
                      <div className="flex items-center gap-3 py-2">
                        <div className="size-9 animate-pulse rounded-lg bg-muted" />
                        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredProducts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-20 text-center">
                    <p className="text-sm font-medium">No products found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {searchQuery || activeFilterCount
                        ? "Try clearing search or filters."
                        : "Add your first product to get started."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => {
                  const image = getProductPrimaryImage(product);
                  const stock = totalStock(product);
                  const status = stockStatus(stock);

                  return (
                    <TableRow key={product.id} className="border-border/60">
                      <TableCell className="py-3 pl-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="size-9 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted">
                            {image ? (
                              <img
                                src={image}
                                alt={product.name}
                                className="size-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{product.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {variantSummary(product.variants)}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {product.brand}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        ₹{product.base_price}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              status === "out"
                                ? "text-destructive"
                                : status === "low"
                                  ? "text-amber-700"
                                  : "text-foreground"
                            )}
                          >
                            {stock}
                          </span>
                          <span
                            className={cn(
                              "text-[11px]",
                              status === "out"
                                ? "text-destructive"
                                : status === "low"
                                  ? "text-amber-700"
                                  : "text-muted-foreground"
                            )}
                          >
                            {stockLabel(status)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {product.department || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {product.category || "—"}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/products/${product.id}/edit`}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "sm" }),
                              "gap-1.5"
                            )}
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </Link>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setProductToDelete(product)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <Dialog
        open={!!productToDelete}
        onOpenChange={(open) => {
          if (!open) setProductToDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete product?</DialogTitle>
            <DialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{productToDelete?.name}</span> and
              all of its size variants from the catalog.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setProductToDelete(null)}
              disabled={!!deletingId}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={!!deletingId}
            >
              {deletingId ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
