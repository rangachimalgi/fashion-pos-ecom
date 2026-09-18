"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { CompleteProduct, ProductVariant } from "@/types/product";
import { getProductPrimaryImage } from "@/lib/productImages";
import { cn } from "@/lib/utils";
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

function totalStock(product: CompleteProduct): number {
  return product.variants.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);
}

export default function AdminPanelPage() {
  const [products, setProducts] = useState<CompleteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<CompleteProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!query) return products;

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.brand.toLowerCase().includes(query) ||
        product.category?.toLowerCase().includes(query) ||
        product.department?.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

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
        const hint =
          productError.message.toLowerCase().includes("policy") ||
          productError.code === "42501"
            ? "\n\nRun supabase/migrations/004_admin_product_mutations.sql in the Supabase SQL Editor."
            : "";
        throw new Error(productError.message + hint);
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Back office
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/billing/add-product"
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
            >
              <Plus className="size-3.5" />
              Add product
            </Link>
            <Link
              href="/billing"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <ArrowLeft className="size-3.5" />
              POS
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Products</h2>
            <p className="text-sm text-muted-foreground">
              {loading
                ? "Loading catalog…"
                : `${filteredProducts.length} product${filteredProducts.length === 1 ? "" : "s"}`}
            </p>
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, brand, category…"
              className="h-9 pl-9"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[52%] pl-4">Product</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell className="pl-4" colSpan={6}>
                      <div className="flex items-center gap-3 py-1">
                        <div className="size-11 animate-pulse rounded-lg bg-muted" />
                        <div className="space-y-2">
                          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredProducts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-16 text-center">
                    <p className="text-sm font-medium text-foreground">No products found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {searchQuery
                        ? "Try a different search."
                        : "Add your first product to get started."}
                    </p>
                    {!searchQuery ? (
                      <Link
                        href="/billing/add-product"
                        className={cn(
                          buttonVariants({ size: "sm" }),
                          "mt-4 inline-flex gap-1.5"
                        )}
                      >
                        <Plus className="size-3.5" />
                        Add product
                      </Link>
                    ) : null}
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => {
                  const image = getProductPrimaryImage(product);
                  const stock = totalStock(product);

                  return (
                    <TableRow key={product.id}>
                      <TableCell className="pl-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                            {image ? (
                              <img
                                src={image}
                                alt={product.name}
                                className="size-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{product.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {product.brand}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {product.department || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {product.category || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">₹{product.base_price}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "font-medium",
                            stock === 0 ? "text-destructive" : "text-foreground"
                          )}
                        >
                          {stock}
                        </span>
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
              <span className="font-medium text-foreground">
                {productToDelete?.name}
              </span>{" "}
              and all of its size variants from the catalog.
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
