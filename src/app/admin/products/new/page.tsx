"use client";

import { ProductForm } from "@/components/admin/ProductForm";

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <ProductForm mode="create" />
    </div>
  );
}
