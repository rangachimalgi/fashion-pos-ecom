"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { STORE_DEPARTMENTS, type StoreDepartment } from "@/lib/categories";
import {
  createStoreCategory,
  deleteStoreCategory,
  listStoreCategories,
  uploadCategoryImage,
  type StoreCategoryRow,
} from "@/lib/storeCategories";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminCategoriesPage() {
  const [rows, setRows] = useState<StoreCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState<StoreDepartment>("Men");
  const [name, setName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listStoreCategories(supabase));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const visible = useMemo(
    () => rows.filter((row) => row.department === department),
    [rows, department]
  );

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      let image_url: string | null = null;
      if (imageFile) image_url = await uploadCategoryImage(supabase, imageFile);
      await createStoreCategory(supabase, { department, name, image_url });
      setName("");
      setImageFile(null);
      await fetchRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create category");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: StoreCategoryRow) => {
    if (!window.confirm(`Remove “${row.name}” from ${row.department}? Products keep this type until you edit them.`)) {
      return;
    }
    setDeletingId(row.id);
    setError(null);
    try {
      await deleteStoreCategory(supabase, row.id);
      await fetchRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        {STORE_DEPARTMENTS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDepartment(value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              department === value
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-white text-muted-foreground hover:text-foreground"
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-xl border border-border/80 bg-white p-4 shadow-sm sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">New {department} category</label>
          <Input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Polos"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Photo (optional)</label>
          <Input
            type="file"
            accept="image/*"
            onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <Button type="submit" disabled={saving} className="gap-1.5">
          <Plus className="size-3.5" />
          {saving ? "Saving…" : "Add"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 pl-4 text-xs text-muted-foreground">Category</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Shop URL</TableHead>
              <TableHead className="h-11 pr-4 text-right text-xs text-muted-foreground">
                {" "}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  No categories for {department} yet. Add one above.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="py-3 pl-4">
                    <div className="flex items-center gap-3">
                      <div className="size-12 overflow-hidden rounded-lg bg-muted">
                        {row.image_url ? (
                          <img src={row.image_url} alt="" className="size-full object-cover" />
                        ) : null}
                      </div>
                      <p className="text-sm font-medium">{row.name}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    /shop/{department.toLowerCase()}/{row.slug}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={deletingId === row.id}
                      onClick={() => handleDelete(row)}
                      aria-label={`Delete ${row.name}`}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
