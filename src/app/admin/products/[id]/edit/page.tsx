"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { CompleteProduct } from "@/types/product";
import { ProductForm } from "@/components/admin/ProductForm";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function EditProductPage() {
  const params = useParams();
  const productId = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<CompleteProduct | null>(null);

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

        setProduct({
          ...data,
          variants: data.product_variants || [],
        });
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load product");
      } finally {
        setLoading(false);
      }
    }

    loadProduct();
  }, [productId]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading product…
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <p className="text-sm font-medium text-destructive">{error || "Product not found"}</p>
        <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <ProductForm mode="edit" product={product} />
    </div>
  );
}
