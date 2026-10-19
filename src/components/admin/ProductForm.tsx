"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { CompleteProduct } from "@/types/product";
import {
  STORE_DEPARTMENTS,
  getDefaultCategory,
  type ProductCategory,
  type StoreDepartment,
} from "@/lib/categories";
import { categoriesForDepartment, useStoreCategories } from "@/lib/storeCategories";
import { MAX_PRODUCT_IMAGES, getProductImages } from "@/lib/productImages";
import {
  mutationHint,
  normalizeScanCode,
  uploadProductImages,
} from "@/lib/productAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type VariantDraft = {
  key: string;
  id?: string;
  size: string;
  color: string;
  barcode: string;
  stock_quantity: number;
};

type ProductFormProps = {
  mode: "create" | "edit";
  product?: CompleteProduct;
};

let variantDraftCount = 0;

function newVariant(): VariantDraft {
  variantDraftCount += 1;
  return {
    key: `draft-${variantDraftCount}`,
    size: "",
    color: "",
    barcode: "",
    stock_quantity: 1,
  };
}

export function ProductForm({ mode, product }: ProductFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    style_code: product?.style_code ?? "",
    price: product ? String(product.base_price) : "",
    description: product?.description ?? "",
    department: (product?.department as StoreDepartment) || "Men",
    category:
      (product?.category as ProductCategory) || getDefaultCategory("Men"),
  });

  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    product?.variants.length
      ? product.variants.map((variant) => ({
          key: variant.id,
          id: variant.id,
          size: variant.size,
          color: variant.color,
          barcode: variant.barcode ?? "",
          stock_quantity: variant.stock_quantity,
        }))
      : [newVariant()]
  );

  const [existingImages, setExistingImages] = useState<string[]>(() =>
    product ? getProductImages(product) : []
  );
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const categoryRows = useStoreCategories();
  const departmentCategories = categoriesForDepartment(form.department, categoryRows);

  useEffect(() => {
    if (!categoryRows) return;
    const list = categoriesForDepartment(form.department, categoryRows);
    if (list.some((category) => category.id === form.category)) return;
    const fallback = list[0]?.id;
    if (fallback) setForm((current) => ({ ...current, category: fallback }));
  }, [categoryRows, form.department, form.category]);
  const imageCount = existingImages.length + imageFiles.length;

  useEffect(() => {
    if (!imageFiles.length) {
      setImagePreviews([]);
      return;
    }

    const previewUrls = imageFiles.map((file) => URL.createObjectURL(file));
    setImagePreviews(previewUrls);

    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageFiles]);

  const gallery = useMemo(
    () => [
      ...existingImages.map((url) => ({ kind: "existing" as const, url })),
      ...imagePreviews.map((url) => ({ kind: "new" as const, url })),
    ],
    [existingImages, imagePreviews]
  );

  const handleImageSelection = (fileList: FileList | null) => {
    if (!fileList?.length) return;

    const incoming = Array.from(fileList);
    const remaining = MAX_PRODUCT_IMAGES - existingImages.length - imageFiles.length;
    const accepted = incoming.slice(0, Math.max(0, remaining));

    if (incoming.length > accepted.length) {
      setWarning(`You can upload up to ${MAX_PRODUCT_IMAGES} product images.`);
    }

    setImageFiles((current) => [...current, ...accepted]);
  };

  const removeExistingImage = (index: number) => {
    setExistingImages((current) => current.filter((_, i) => i !== index));
  };

  const removeNewImage = (index: number) => {
    setImageFiles((current) => current.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (imageCount === 0) {
      setError("Add at least one product image.");
      return;
    }

    const preparedVariants = variants.map((variant) => ({
      ...variant,
      size: variant.size.trim(),
      color: variant.color.trim(),
      barcode: normalizeScanCode(variant.barcode),
    }));

    if (preparedVariants.some((variant) => !variant.size || !variant.color || !variant.barcode)) {
      setError("Each size row needs size, color, and the invoice EAN / barcode.");
      return;
    }

    const barcodes = preparedVariants.map((variant) => variant.barcode.toLowerCase());
    if (new Set(barcodes).size !== barcodes.length) {
      setError("Each size row needs a different EAN / barcode.");
      return;
    }

    setSaving(true);
    setError(null);
    setWarning(null);

    try {
      const uploaded = imageFiles.length ? await uploadProductImages(imageFiles) : [];
      const imageUrls = [...existingImages, ...uploaded];
      const cover = imageUrls[0];
      const styleCode = form.style_code.trim() || null;

      const details = {
        name: form.name.trim(),
        brand: form.brand.trim(),
        style_code: styleCode,
        base_price: parseFloat(form.price),
        description: form.description.trim() || null,
        department: form.department,
        category: form.category,
        image_url: cover,
      };

      let productId = product?.id;
      let galleryColumnMissing = false;

      if (mode === "create") {
        let insertError: { message?: string; code?: string } | null = null;
        let inserted: { id: string } | null = null;

        ({ data: inserted, error: insertError } = await supabase
          .from("products")
          .insert([{ ...details, image_urls: imageUrls }])
          .select("id")
          .single());

        const missingStyle =
          insertError?.message?.toLowerCase().includes("style_code") ||
          (insertError?.code === "PGRST204" && Boolean(styleCode));

        if (missingStyle) {
          const { style_code: _ignored, ...withoutStyle } = details;
          ({ data: inserted, error: insertError } = await supabase
            .from("products")
            .insert([{ ...withoutStyle, image_urls: imageUrls }])
            .select("id")
            .single());
        }

        if (
          insertError?.message?.toLowerCase().includes("image_urls") ||
          insertError?.code === "PGRST204"
        ) {
          galleryColumnMissing = true;
          const { style_code: _ignored, ...withoutStyle } = details;
          ({ data: inserted, error: insertError } = await supabase
            .from("products")
            .insert([missingStyle ? withoutStyle : details])
            .select("id")
            .single());
        }

        if (insertError || !inserted) {
          throw new Error(
            (insertError?.message || "Product was not created") +
              mutationHint(insertError?.message || "", insertError?.code)
          );
        }

        productId = inserted.id;
      } else if (productId) {
        const { error: updateError } = await supabase
          .from("products")
          .update({ ...details, image_urls: imageUrls })
          .eq("id", productId);

        const missingStyle =
          updateError?.message?.toLowerCase().includes("style_code") ||
          (updateError?.code === "PGRST204" && Boolean(styleCode));

        if (missingStyle && updateError) {
          const { style_code: _ignored, ...withoutStyle } = details;
          const { error: retryError } = await supabase
            .from("products")
            .update({ ...withoutStyle, image_urls: imageUrls })
            .eq("id", productId);
          if (
            retryError?.message?.toLowerCase().includes("image_urls") ||
            retryError?.code === "PGRST204"
          ) {
            galleryColumnMissing = true;
            const { error: fallbackError } = await supabase
              .from("products")
              .update(withoutStyle)
              .eq("id", productId);
            if (fallbackError) {
              throw new Error(
                fallbackError.message + mutationHint(fallbackError.message, fallbackError.code)
              );
            }
          } else if (retryError) {
            throw new Error(retryError.message + mutationHint(retryError.message, retryError.code));
          }
        } else if (
          updateError?.message?.toLowerCase().includes("image_urls") ||
          updateError?.code === "PGRST204"
        ) {
          galleryColumnMissing = true;
          const { error: fallbackError } = await supabase
            .from("products")
            .update(details)
            .eq("id", productId);
          if (fallbackError) {
            throw new Error(fallbackError.message + mutationHint(fallbackError.message, fallbackError.code));
          }
        } else if (updateError) {
          throw new Error(updateError.message + mutationHint(updateError.message, updateError.code));
        }
      }

      if (!productId) throw new Error("Product was not saved");

      const keptIds = variants.map((variant) => variant.id).filter(Boolean) as string[];

      if (mode === "edit" && product) {
        const removed = product.variants
          .map((variant) => variant.id)
          .filter((id) => !keptIds.includes(id));

        if (removed.length) {
          const { error: deleteError } = await supabase
            .from("product_variants")
            .delete()
            .in("id", removed);
          if (deleteError) throw deleteError;
        }
      }

      for (const variant of preparedVariants) {
        const payload = {
          size: variant.size,
          color: variant.color,
          barcode: variant.barcode,
          stock_quantity: variant.stock_quantity,
        };

        if (variant.id) {
          const { error: variantError } = await supabase
            .from("product_variants")
            .update(payload)
            .eq("id", variant.id);
          if (variantError) {
            throw new Error(
              variantError.message + mutationHint(variantError.message, variantError.code)
            );
          }
        } else {
          const { error: variantError } = await supabase.from("product_variants").insert({
            ...payload,
            product_id: productId,
          });
          if (variantError) {
            throw new Error(
              variantError.message + mutationHint(variantError.message, variantError.code)
            );
          }
        }
      }

      if (galleryColumnMissing && imageUrls.length > 1) {
        setWarning(
          `Saved with the cover image only. Run supabase/migrations/003_product_image_urls.sql to keep all ${imageUrls.length} gallery images.`
        );
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "Product details" : form.name || "Product"}</CardTitle>
        <CardDescription>
          {mode === "create"
            ? "Paste the invoice EAN on each size row. The first image is the catalog cover."
            : "Update images, EAN codes, and stock. The first image is the catalog cover."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
            {error}
          </div>
        ) : null}
        {warning ? (
          <div className="mb-4 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {warning}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Images ({imageCount}/{MAX_PRODUCT_IMAGES})
            </label>
            <Input
              type="file"
              accept="image/*"
              multiple
              disabled={imageCount >= MAX_PRODUCT_IMAGES || saving}
              onChange={(event) => {
                handleImageSelection(event.target.files);
                event.target.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">
              Up to {MAX_PRODUCT_IMAGES} images. First image is the cover.
            </p>
            {gallery.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.map((item, index) => (
                  <div
                    key={`${item.kind}-${item.url}-${index}`}
                    className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
                  >
                    <img
                      src={item.url}
                      alt={`Product ${index + 1}`}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        item.kind === "existing"
                          ? removeExistingImage(index)
                          : removeNewImage(index - existingImages.length)
                      }
                      aria-label={`Remove image ${index + 1}`}
                      className="absolute top-2 right-2 rounded-full bg-background/90 p-1 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                    {index === 0 ? (
                      <span className="absolute bottom-2 left-2 rounded bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                        Cover
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Brand</label>
              <Input
                required
                value={form.brand}
                onChange={(event) => setForm({ ...form, brand: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Product code (style)
              </label>
              <Input
                value={form.style_code}
                placeholder="XYRK0072-W1-82F"
                onChange={(event) => setForm({ ...form, style_code: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">MRP (INR)</label>
              <Input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Department</label>
              <select
                required
                value={form.department}
                onChange={(event) => {
                  const department = event.target.value as StoreDepartment;
                  const nextCategories = categoriesForDepartment(department, categoryRows);
                  setForm({
                    ...form,
                    department,
                    category: nextCategories[0]?.id ?? getDefaultCategory(department),
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
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {departmentCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Need another type? Add it in{" "}
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={() => router.push("/admin/categories")}
                >
                  Categories
                </button>
                .
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="flex min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">Variants</h3>
                <p className="text-xs text-muted-foreground">
                  Size can be S–XXL or 039. EAN is the scan code from the invoice.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVariants((current) => [...current, newVariant()])}
              >
                Add row
              </Button>
            </div>
            <div className="space-y-2">
              {variants.map((variant, index) => (
                <div
                  key={variant.key}
                  className="grid grid-cols-12 gap-2 rounded-xl border border-border p-3"
                >
                  <div className="col-span-6 space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-medium text-muted-foreground">Size</label>
                    <Input
                      required
                      value={variant.size}
                      placeholder="039"
                      onChange={(event) => {
                        const next = [...variants];
                        next[index] = { ...variant, size: event.target.value };
                        setVariants(next);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-6 space-y-1 sm:col-span-3">
                    <label className="text-[10px] font-medium text-muted-foreground">Color</label>
                    <Input
                      required
                      value={variant.color}
                      placeholder="White"
                      onChange={(event) => {
                        const next = [...variants];
                        next[index] = { ...variant, color: event.target.value };
                        setVariants(next);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-8 space-y-1 sm:col-span-4">
                    <label className="text-[10px] font-medium text-muted-foreground">
                      EAN / barcode
                    </label>
                    <Input
                      required
                      value={variant.barcode}
                      placeholder="89094471002526006"
                      onChange={(event) => {
                        const next = [...variants];
                        next[index] = { ...variant, barcode: event.target.value };
                        setVariants(next);
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div className="col-span-4 space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-medium text-muted-foreground">Stock</label>
                    <Input
                      required
                      type="number"
                      min="0"
                      value={variant.stock_quantity}
                      onChange={(event) => {
                        const next = [...variants];
                        next[index] = {
                          ...variant,
                          stock_quantity: parseInt(event.target.value, 10) || 0,
                        };
                        setVariants(next);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-12 flex items-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={variants.length === 1}
                      onClick={() =>
                        setVariants((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </Button>
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
              {saving
                ? mode === "create"
                  ? "Publishing…"
                  : "Saving…"
                : mode === "create"
                  ? "Publish product"
                  : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
