"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { CompleteProduct, ProductVariant } from "@/types/product";
import {
  STORE_DEPARTMENTS,
  getCategoriesForDepartment,
  getDefaultCategory,
  type ProductCategory,
  type StoreDepartment,
} from "@/lib/categories";
import { getProductPrimaryImage } from "@/lib/productImages";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type VariantEdit = {
  id: string;
  size: ProductVariant["size"];
  color: string;
  stock_quantity: number;
};

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<CompleteProduct | null>(null);

  const [form, setForm] = useState({
    name: "",
    brand: "",
    price: "",
    description: "",
    department: "Men" as StoreDepartment,
    category: getDefaultCategory("Men") as ProductCategory,
  });
  const [variants, setVariants] = useState<VariantEdit[]>([]);

  const departmentCategories = getCategoriesForDepartment(form.department);

  useEffect(() => {
    if (!productId) return;

    async function loadProduct() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from("products")
          .select("*, product_variants(*)")
          .eq("id", productId)
          .single();

        if (fetchError) throw fetchError;

        const formatted: CompleteProduct = {
          ...data,
          variants: data.product_variants || [],
        };

        const department = (formatted.department as StoreDepartment) || "Men";
        const categories = getCategoriesForDepartment(department);
        const category =
          categories.find((c) => c.id === formatted.category)?.id ||
          getDefaultCategory(department);

        setProduct(formatted);
        setForm({
          name: formatted.name,
          brand: formatted.brand,
          price: String(formatted.base_price),
          description: formatted.description || "",
          department,
          category,
        });
        setVariants(
          formatted.variants.map((v) => ({
            id: v.id,
            size: v.size,
            color: v.color,
            stock_quantity: v.stock_quantity,
          }))
        );
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load product");
      } finally {
        setLoading(false);
      }
    }

    loadProduct();
  }, [productId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;

    setSaving(true);
    setError(null);

    try {
      const { error: productError } = await supabase
        .from("products")
        .update({
          name: form.name.trim(),
          brand: form.brand.trim(),
          base_price: parseFloat(form.price),
          description: form.description.trim() || null,
          department: form.department,
          category: form.category,
        })
        .eq("id", product.id);

      if (productError) {
        const hint =
          productError.message.toLowerCase().includes("policy") ||
          productError.code === "42501"
            ? "\n\nRun supabase/migrations/004_admin_product_mutations.sql in the Supabase SQL Editor."
            : "";
        throw new Error(productError.message + hint);
      }

      for (const variant of variants) {
        const { error: variantError } = await supabase
          .from("product_variants")
          .update({
            size: variant.size,
            color: variant.color.trim(),
            stock_quantity: variant.stock_quantity,
          })
          .eq("id", variant.id);

        if (variantError) throw variantError;
      }

      router.push("/admin");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading product…
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm font-medium text-destructive">{error || "Product not found"}</p>
        <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to admin
        </Link>
      </div>
    );
  }

  const image = getProductPrimaryImage(product);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Edit product
            </p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{product.name}</h1>
          </div>
          <Link
            href="/admin"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 shrink-0")}
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        <Card>
          <CardHeader className="flex-row items-center gap-4 space-y-0">
            <div className="size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
              {image ? (
                <img src={image} alt={product.name} className="size-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate">{product.name}</CardTitle>
              <CardDescription>
                Update details and stock. Image changes stay on the add-product flow for now.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Brand</label>
                  <Input
                    required
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Price (INR)</label>
                  <Input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Department</label>
                  <select
                    required
                    value={form.department}
                    onChange={(e) => {
                      const department = e.target.value as StoreDepartment;
                      setForm({
                        ...form,
                        department,
                        category: getDefaultCategory(department),
                      });
                    }}
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {STORE_DEPARTMENTS.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <select
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {departmentCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="flex min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <div>
                  <h3 className="text-sm font-medium">Variants</h3>
                  <p className="text-xs text-muted-foreground">
                    Update size, color, and available stock.
                  </p>
                </div>
                <div className="space-y-2">
                  {variants.map((variant, index) => (
                    <div
                      key={variant.id}
                      className="grid grid-cols-12 gap-2 rounded-xl border border-border p-3"
                    >
                      <div className="col-span-3 space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Size
                        </label>
                        <select
                          value={variant.size}
                          onChange={(e) => {
                            const next = [...variants];
                            next[index] = {
                              ...variant,
                              size: e.target.value as ProductVariant["size"],
                            };
                            setVariants(next);
                          }}
                          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs outline-none"
                        >
                          {["S", "M", "L", "XL", "XXL"].map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-5 space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Color
                        </label>
                        <Input
                          required
                          value={variant.color}
                          onChange={(e) => {
                            const next = [...variants];
                            next[index] = { ...variant, color: e.target.value };
                            setVariants(next);
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Stock
                        </label>
                        <Input
                          required
                          type="number"
                          min="0"
                          value={variant.stock_quantity}
                          onChange={(e) => {
                            const next = [...variants];
                            next[index] = {
                              ...variant,
                              stock_quantity: parseInt(e.target.value, 10) || 0,
                            };
                            setVariants(next);
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/admin")}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
