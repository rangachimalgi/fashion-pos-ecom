"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Printer, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { CompleteProduct, ProductVariant } from "@/types/product";
import { buildHangTag, type HangTag } from "@/lib/storeTag";
import { TAG_HEIGHT_MM, chunkHangTagRows, printHangTags, rowsPerSheet } from "@/lib/printHangTags";
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
          {[row.left, row.right].map((slot, index) => (
            <div key={index} className="tag-slot">
              {slot ? (
                <ProductHangTag tag={slot} />
              ) : (
                // A sticker you asked to leave blank (already used).
                <div className="box-border h-[25mm] w-[45mm] rounded-sm border border-dashed border-border" />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// The alignment you tune for this printer is remembered in the browser (it used to reset on every reload).
const ALIGN_STORAGE_KEY = "hangtag-alignment";
const DEFAULT_ALIGN: Align = { pitch: 29, x: 0, y: 10.5 };
const alignListeners = new Set<() => void>();
let alignRaw: string | null | undefined;

function readAlignRaw(): string | null {
  if (alignRaw === undefined) {
    try {
      alignRaw = window.localStorage.getItem(ALIGN_STORAGE_KEY);
    } catch {
      alignRaw = null;
    }
  }
  return alignRaw;
}

function subscribeAlign(listener: () => void) {
  alignListeners.add(listener);
  return () => {
    alignListeners.delete(listener);
  };
}

function saveAlign(next: Align) {
  alignRaw = JSON.stringify(next);
  try {
    window.localStorage.setItem(ALIGN_STORAGE_KEY, alignRaw);
  } catch {
    /* storage blocked: the setting still applies until the page is closed */
  }
  alignListeners.forEach((listener) => listener());
}

function parseAlign(raw: string | null): Align {
  try {
    const saved = JSON.parse(raw ?? "null") as Partial<Align> | null;
    if (saved && [saved.pitch, saved.x, saved.y].every((value) => typeof value === "number" && Number.isFinite(value))) {
      return { pitch: saved.pitch!, x: saved.x!, y: saved.y! };
    }
  } catch {
    /* fall through to the defaults */
  }
  return DEFAULT_ALIGN;
}

type Align = { pitch: number; x: number; y: number };

function HangTagPages({
  rows,
  align,
}: {
  rows: ReturnType<typeof chunkHangTagRows>;
  align: Align;
}) {
  const pitch = Math.max(TAG_HEIGHT_MM + 0.5, align.pitch);
  const perPage = rowsPerSheet(align.pitch, align.y);
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
              <div className="tag-slot">{row.left ? <ProductHangTag tag={row.left} /> : null}</div>
              <div className="tag-slot">{row.right ? <ProductHangTag tag={row.right} /> : null}</div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function AdminTagsPageInner() {
  const searchParams = useSearchParams();
  const savedAlign = useSyncExternalStore(subscribeAlign, readAlignRaw, () => null);
  const align = useMemo(() => parseAlign(savedAlign), [savedAlign]);
  // Stickers already used at the top of a part-used sheet; printing starts after them.
  const [skip, setSkip] = useState(0);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const productId = searchParams.get("product");
  // ?purchase=<id>: only the sizes bought on that purchase, one tag per piece.
  const purchaseId = searchParams.get("purchase");
  const [purchaseQty, setPurchaseQty] = useState<Record<string, number> | null>(null);
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

  useEffect(() => {
    if (!purchaseId) return;
    let cancelled = false;
    supabase
      .from("purchase_items")
      .select("variant_id, qty")
      .eq("purchase_id", purchaseId)
      .then(({ data, error: purchaseError }) => {
        if (cancelled) return;
        if (purchaseError) {
          setError(purchaseError.message);
          setPurchaseQty({});
          return;
        }
        const map: Record<string, number> = {};
        for (const item of (data ?? []) as Array<{ variant_id: string | null; qty: number }>) {
          if (item.variant_id) map[item.variant_id] = (map[item.variant_id] ?? 0) + Number(item.qty);
        }
        setPurchaseQty(map);
      });
    return () => {
      cancelled = true;
    };
  }, [purchaseId]);

  const rows = useMemo<TagRow[]>(() => {
    const q = query.trim().toLowerCase();
    const list: TagRow[] = [];
    if (purchaseId && !purchaseQty) return list;
    for (const product of products) {
      if (productId && product.id !== productId) continue;
      for (const variant of product.variants) {
        if (purchaseQty && !(variant.id in purchaseQty)) continue;
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
  }, [products, query, productId, purchaseId, purchaseQty]);

  useEffect(() => {
    if ((!productId && !purchaseQty) || loading) return;
    setSelected((current) => {
      if (Object.keys(current).length) return current;
      const next: Record<string, number> = {};
      for (const row of rows) {
        next[row.key] = purchaseQty ? Math.max(1, Math.min(99, purchaseQty[row.key] ?? 1)) : 1;
      }
      return next;
    });
  }, [productId, purchaseQty, loading, rows]);

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

  const stickersPerSheet = rowsPerSheet(align.pitch, align.y) * 2;
  const skipped = Math.min(Math.max(0, skip), stickersPerSheet - 1);
  const printRows = useMemo(
    () => chunkHangTagRows([...Array<null>(skipped).fill(null), ...previewTags]),
    [previewTags, skipped]
  );

  return (
    <div className="px-4 py-6 md:px-6 print:m-0 print:p-0">
      <div className="no-print mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Same hang-tag as the shop: barcode, style, size, and MRP.
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
              <TableHead>MRP</TableHead>
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

      <div className="no-print mb-3 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-white p-3">
        <label className="text-xs text-muted-foreground">
          Stickers already used on this sheet
          <Input
            type="number"
            min={0}
            max={stickersPerSheet - 1}
            step={1}
            value={skip}
            onChange={(event) => {
              const value = Math.floor(event.target.valueAsNumber);
              setSkip(Number.isFinite(value) ? Math.max(0, Math.min(stickersPerSheet - 1, value)) : 0);
            }}
            className="mt-1 h-8 w-24"
          />
        </label>
        <p className="max-w-md text-xs text-muted-foreground">
          Reusing a part-used sheet? Enter how many stickers are already used (reading left to right, top to
          bottom) and printing starts on the next free one. Leave 0 for a fresh sheet.
          {skipped > 0 ? ` Printing starts at sticker ${skipped + 1} of ${stickersPerSheet}.` : ""}
        </p>
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
              onChange={(event) => {
                const next = {
                  ...align,
                  [key]: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0,
                };
                saveAlign(next);
              }}
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
