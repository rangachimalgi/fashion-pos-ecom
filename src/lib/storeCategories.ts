import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import {
  DEPARTMENT_CATEGORIES,
  categoryToSlug,
  getCategoriesForDepartment,
  type CategoryMeta,
  type StoreDepartment,
} from "@/lib/categories";
import { mutationHint } from "@/lib/productAdmin";

export type StoreCategoryRow = {
  id: string;
  department: StoreDepartment;
  name: string;
  slug: string;
  image_url: string | null;
  sort_order: number;
};

export function slugifyCategoryName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function seedMeta(
  department: StoreDepartment,
  name: string
): CategoryMeta | undefined {
  return DEPARTMENT_CATEGORIES[department].find(
    (category) =>
      category.id.toLowerCase() === name.toLowerCase() ||
      category.label.toLowerCase() === name.toLowerCase()
  );
}

export function rowToCategoryMeta(row: StoreCategoryRow): CategoryMeta {
  const seed = seedMeta(row.department, row.name);
  return {
    id: row.name,
    label: row.name,
    image: row.image_url || seed?.image || "/categories/tshirts.jpg",
    accent: seed?.accent ?? "#BB802A",
    accentSoft: seed?.accentSoft ?? "#F6E7D0",
    tagline: seed?.tagline ?? "",
  };
}

function missingTableHint(message: string) {
  if (
    message.toLowerCase().includes("does not exist") ||
    message.toLowerCase().includes("schema cache")
  ) {
    return "\n\nRun supabase/migrations/009_product_categories.sql in the Supabase SQL Editor.";
  }
  return mutationHint(message);
}

export async function listStoreCategories(
  supabase: SupabaseClient,
  department?: StoreDepartment
): Promise<StoreCategoryRow[]> {
  let query = supabase
    .from("product_categories")
    .select("id, department, name, slug, image_url, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (department) query = query.eq("department", department);

  const { data, error } = await query;
  if (error) throw new Error(error.message + missingTableHint(error.message));
  return (data ?? []) as StoreCategoryRow[];
}

export async function createStoreCategory(
  supabase: SupabaseClient,
  input: {
    department: StoreDepartment;
    name: string;
    image_url?: string | null;
  }
): Promise<StoreCategoryRow> {
  const name = input.name.trim();
  const slug = slugifyCategoryName(name);
  if (name.length < 2) throw new Error("Enter a category name.");
  if (!slug) throw new Error("Enter a category name with letters or numbers.");

  const { data, error } = await supabase
    .from("product_categories")
    .insert({
      department: input.department,
      name,
      slug,
      image_url: input.image_url ?? null,
      sort_order: 50,
    })
    .select("id, department, name, slug, image_url, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(`“${name}” already exists in ${input.department}.`);
    }
    throw new Error(error.message + missingTableHint(error.message));
  }

  return data as StoreCategoryRow;
}

export async function updateStoreCategory(
  supabase: SupabaseClient,
  id: string,
  input: { name: string; image_url?: string | null }
): Promise<void> {
  const name = input.name.trim();
  const slug = slugifyCategoryName(name);
  if (name.length < 2) throw new Error("Enter a category name.");

  const patch: Record<string, unknown> = { name, slug };
  if (input.image_url !== undefined) patch.image_url = input.image_url;

  const { error } = await supabase.from("product_categories").update(patch).eq("id", id);
  if (error) throw new Error(error.message + missingTableHint(error.message));
}

export async function deleteStoreCategory(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("product_categories").delete().eq("id", id);
  if (error) throw new Error(error.message + missingTableHint(error.message));
}

export async function uploadCategoryImage(supabase: SupabaseClient, file: File): Promise<string> {
  const fileExtension = file.name.split(".").pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExtension}`;
  const filePath = `categories/${fileName}`;

  const { error } = await supabase.storage.from("product-images").upload(filePath, file);
  if (error) throw error;

  return supabase.storage.from("product-images").getPublicUrl(filePath).data.publicUrl;
}

export function categoriesForDepartment(
  department: StoreDepartment,
  rows: StoreCategoryRow[] | null
): CategoryMeta[] {
  if (rows == null || rows.length === 0) {
    return [...getCategoriesForDepartment(department)];
  }
  return rows
    .filter((row) => row.department === department)
    .map(rowToCategoryMeta);
}

export function resolveCategoryId(
  slug: string,
  department: StoreDepartment,
  rows: StoreCategoryRow[] | null
): string | null {
  const normalized = slug.toLowerCase().replace(/[\s_-]/g, "");
  if (!normalized) return null;

  const pool = categoriesForDepartment(department, rows);
  const match = pool.find(
    (category) =>
      categoryToSlug(category.id).replace(/-/g, "") === normalized ||
      category.id.toLowerCase().replace(/[\s_-]/g, "") === normalized ||
      category.label.toLowerCase().replace(/[\s_-]/g, "") === normalized
  );
  return match?.id ?? slug;
}

export function useStoreCategories(department?: StoreDepartment) {
  const [rows, setRows] = useState<StoreCategoryRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listStoreCategories(supabase, department)
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [department]);

  return rows;
}
