"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { CompleteProduct, ProductVariant } from "@/types/product";
import { buildHangTag, type HangTag } from "@/lib/storeTag";
import { chunkHangTagRows, printHangTags } from "@/lib/printHangTags";
import { ProductHangTag } from "@/components/admin/ProductHangTag";
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

type TagRow = {
  key: string;
  product: CompleteProduct;
  variant: ProductVariant;
  tag: HangTag;
};

export default function AdminTagsPage() {
  return (
    <Suspense fallback={<p className="px-6 py-8 text-sm text-muted-foreground">Loading tags…</p>}>
      <AdminTagsPageInner />
    </Suspense>
  );
}

function AdminTagsPageInner() {
  const searchParams = useSearchParams();
  const productId = searchParams.get("product");
  const [products, setProducts] = useState<CompleteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});

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
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const rows = useMemo<TagRow[]>(() => {
    const q = query.trim().toLowerCase();
    const list: TagRow[] = [];
    for (const product of products) {
      if (productId && product.id !== productId) continue;
      for (const variant of product.variants) {
        if (!variant.barcode && !product.style_code) continue;
        const hay = [
          product.name,
          product.style_code,
          product.category,
          variant.barcode,
          variant.size,
          variant.color,
        ]
          .join(" ")
          .toLowerCase();
        if (q && !hay.includes(q)) continue;
        list.push({
          key: variant.id,
          product,
          variant,
          tag: buildHangTag(product, variant),
        });
      }
    }
    return list;
  }, [products, query, productId]);

  useEffect(() => {
    if (!productId || loading) return;
    setSelected((current) => {
      if (Object.keys(current).length) return current;
      const next: Record<string, number> = {};
      for (const row of rows) next[row.key] = 1;
      return next;
    });
  }, [productId, loading, rows]);

  const previewTags = useMemo(() => {
    const tags: HangTag[] = [];
    for (const row of rows) {
      const copies = selected[row.key] ?? 0;
      for (let i = 0; i < copies; i += 1) tags.push(row.tag);
    }
    return tags;
  }, [rows, selected]);

  const selectedCount = Object.values(selected).filter((n) => n > 0).length;

  const toggle = (key: string) => {
    setSelected((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = 1;
      return next;
    });
  };

  const setCopies = (key: string, value: number) => {
    const copies = Number.isFinite(value) ? Math.max(0, Math.min(99, Math.floor(value))) : 0;
    setSelected((current) => {
      const next = { ...current };
      if (copies <= 0) delete next[key];
      else next[key] = copies;
      return next;
    });
  };

  const selectVisible = () => {
    const next: Record<string, number> = { ...selected };
    for (const row of rows) next[row.key] = next[row.key] || 1;
    setSelected(next);
  };

  const printTags = () => {
    if (!previewTags.length) return;
    printHangTags();
  };

  const printRows = useMemo(() => chunkHangTagRows(previewTags), [previewTags]);

  return (
    <div className="px-4 py-6 md:px-6 print:m-0 print:p-0">
      <div className="no-print mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Same hang-tag as the shop: barcode, style, size, and Rate from cost — not MRP.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, EAN, size"
              className="h-9 w-56 bg-white pl-8"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={selectVisible}>
            Select visible
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={previewTags.length === 0}
            onClick={printTags}
          >
            <Printer className="size-3.5" />
            Print {previewTags.length || ""} Tags
          </Button>
        </div>
      </div>

      {error ? (
        <p className="no-print mb-4 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="no-print mb-8 overflow-hidden rounded-xl border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4" />
              <TableHead>Product</TableHead>
              <TableHead>EAN</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Rate (cost)</TableHead>
              <TableHead className="pr-4 text-right">Copies</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Loading catalog…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No sizes with a barcode or style code.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const copies = selected[row.key] ?? 0;
                return (
                  <TableRow key={row.key}>
                    <TableCell className="pl-4">
                      <input
                        type="checkbox"
                        checked={copies > 0}
                        onChange={() => toggle(row.key)}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{row.product.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {row.tag.code || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.variant.barcode || "—"}</TableCell>
                    <TableCell>{row.variant.size}</TableCell>
                    <TableCell>{row.tag.rateLabel}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Input
                        type="number"
                        min={0}
                        max={99}
                        value={copies}
                        onChange={(event) => setCopies(row.key, Number(event.target.value))}
                        className="ml-auto h-8 w-16 text-right"
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="no-print mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold">On-screen preview</h2>
          <p className="text-xs text-muted-foreground">
            Two hang tags per row, same layout as the shop sticker.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedCount} size{selectedCount === 1 ? "" : "s"} · {previewTags.length} tag
          {previewTags.length === 1 ? "" : "s"}
        </p>
      </div>

      {previewTags.length === 0 ? (
        <p className="no-print text-sm text-muted-foreground">
          Tick sizes above to see tags. Print outputs two hang tags per row on 110×50 mm.
        </p>
      ) : (
        <div className="tag-print-root flex flex-wrap gap-3 print:block print:gap-0">
          {printRows.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="tag-print-row flex flex-nowrap gap-3 print:flex print:flex-row print:gap-0"
            >
              <div className="tag-slot">
                <ProductHangTag tag={row.left} />
              </div>
              <div className="tag-slot">
                {row.right ? <ProductHangTag tag={row.right} /> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
