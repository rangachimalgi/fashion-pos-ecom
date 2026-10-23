"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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

function HangTagRows({
  rows,
  className,
}: {
  rows: ReturnType<typeof chunkHangTagRows>;
  className?: string;
}) {
  return (
    <div className={className}>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="tag-print-row flex flex-nowrap gap-3">
          <div className="tag-slot">
            <ProductHangTag tag={row.left} />
          </div>
          <div className="tag-slot">
            {row.right ? <ProductHangTag tag={row.right} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// Driver paper (USER) is 101.6 x 152.4 mm. Rows are stacked on it at the real sticker pitch.
const PAGE_HEIGHT_MM = 152;
const TAG_HEIGHT_MM = 24.6;

type Align = { pitch: number; x: number; y: number };

function HangTagPages({
  rows,
  align,
}: {
  rows: ReturnType<typeof chunkHangTagRows>;
  align: Align;
}) {
  const pitch = Math.max(TAG_HEIGHT_MM + 0.5, align.pitch);
  const perPage = Math.max(1, Math.floor((PAGE_HEIGHT_MM - align.y) / pitch));
  const pages: Array<typeof rows> = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));

  return (
    <>
      {pages.map((pageRows, pageIndex) => (
        <div
          key={pageIndex}
          className="tag-print-page"
          style={{ paddingTop: `${align.y}mm`, paddingLeft: `${align.x}mm` }}
        >
          {pageRows.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="tag-print-row"
              style={{ marginBottom: `${pitch - TAG_HEIGHT_MM}mm` }}
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
      ))}
    </>
  );
}

function AdminTagsPageInner() {
  const searchParams = useSearchParams();
  const [align, setAlign] = useState<Align>({ pitch: 28, x: 0, y: 0 });
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
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

      <div className="no-print mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-white p-3">
        <p className="w-full text-xs text-muted-foreground">
          Print alignment (mm) — only if tags land off the stickers. Row pitch = sticker height + gap.
        </p>
        {(
          [
            ["pitch", "Row pitch", 0.1],
            ["x", "Shift right", 0.5],
            ["y", "Shift down", 0.5],
          ] as const
        ).map(([key, label, step]) => (
          <label key={key} className="text-xs text-muted-foreground">
            {label}
            <Input
              type="number"
              step={step}
              value={align[key]}
              onChange={(event) =>
                setAlign((current) => ({
                  ...current,
                  [key]: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0,
                }))
              }
              className="mt-1 h-8 w-24"
            />
          </label>
        ))}
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
          Tick sizes above to see tags. Print uses the driver USER paper (101.6×152.4 mm) with two tags per sticker row.
        </p>
      ) : (
        <div className="no-print">
          <HangTagRows rows={printRows} className="flex flex-wrap gap-3" />
        </div>
      )}

      {/* Print-only copy, mounted straight under <body> so the admin shell can't affect page layout. */}
      {mounted && previewTags.length > 0
        ? createPortal(
            <div className="tag-print-portal">
              <HangTagPages rows={printRows} align={align} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
